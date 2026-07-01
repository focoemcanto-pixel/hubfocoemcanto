export type DuetAutoSyncResult = {
  offsetMs: number;
  confidence: number;
  strategy: 'marker' | 'waveform';
  reason?: string;
};

type SyncOptions = {
  referenceUrl: string;
  voiceBlob: Blob;
  markerFrequencyHz?: number;
  markerExpectedMs?: number;
  maxOffsetMs?: number;
};

// Coarse stage: downsample to 8kHz to find approximate lag quickly.
const COARSE_RATE = 8000;
// Fine stage: use the full decoded rate (48kHz) inside a narrow window.
const MARKER_FREQUENCY = 1760;
const MARKER_EXPECTED_MS = 220;
const MAX_OFFSET_MS = 900;
// Only analyse the first N seconds — the reference leak in the mic is strongest
// here, before the singer's voice dominates. Using the full recording dilutes
// the correlation peak with vocal energy.
const ANALYSIS_WINDOW_SECONDS = 5;
// Fine-search half-window around the coarse result (ms).
const FINE_HALF_WINDOW_MS = 60;
// Minimum confidence required to trust a waveform result.
const MIN_WAVEFORM_CONFIDENCE = 0.38;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function withFullMedia(url: string) {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}full=1`;
}

async function decodeBlob(context: AudioContext, blob: Blob) {
  const buffer = await blob.arrayBuffer();
  return context.decodeAudioData(buffer.slice(0));
}

async function decodeUrl(context: AudioContext, url: string) {
  const response = await fetch(withFullMedia(url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`reference_audio_fetch_failed:${response.status}`);
  const buffer = await response.arrayBuffer();
  return context.decodeAudioData(buffer.slice(0));
}

function toMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const output = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) output[i] += data[i] / buffer.numberOfChannels;
  }
  return output;
}

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const frac = pos - index;
    const a = input[index] ?? 0;
    const b = input[index + 1] ?? a;
    output[i] = a + (b - a) * frac;
  }
  return output;
}

/** Trim a Float32Array to at most `maxSeconds` of audio at the given sample rate. */
function trimToWindow(samples: Float32Array, sampleRate: number, maxSeconds: number): Float32Array {
  const maxSamples = Math.floor(sampleRate * maxSeconds);
  return samples.length > maxSamples ? samples.subarray(0, maxSamples) : samples;
}

function envelope(samples: Float32Array, windowSize = 96): Float32Array {
  const length = Math.ceil(samples.length / windowSize);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    const start = i * windowSize;
    const end = Math.min(samples.length, start + windowSize);
    for (let j = start; j < end; j += 1) sum += Math.abs(samples[j]);
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

function zNormalize(samples: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < samples.length; i += 1) mean += samples[i];
  mean /= Math.max(1, samples.length);
  let variance = 0;
  for (let i = 0; i < samples.length; i += 1) variance += (samples[i] - mean) ** 2;
  const std = Math.sqrt(variance / Math.max(1, samples.length)) || 1;
  const output = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) output[i] = (samples[i] - mean) / std;
  return output;
}

/**
 * Normalised cross-correlation between `ref` and `voice` over a lag range
 * [minLag..maxLag] (both inclusive, in samples).
 *
 * Returns the best lag (in samples) and a confidence in [0..1].
 * Confidence is derived from the ratio of the peak score to the runner-up,
 * which is a more robust estimator than an absolute threshold.
 */
function xcorr(
  ref: Float32Array,
  voice: Float32Array,
  minLag: number,
  maxLag: number,
): { lag: number; confidence: number } | null {
  const searchLen = Math.min(ref.length, voice.length);
  if (searchLen < 64) return null;

  let bestLag = 0;
  let bestScore = -Infinity;
  let secondScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < searchLen; i += 1) {
      const vi = i + lag;
      if (vi < 0 || vi >= voice.length) continue;
      sum += ref[i] * voice[vi];
      count += 1;
    }
    if (count < searchLen * 0.4) continue;
    const score = sum / count;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestLag = lag;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!Number.isFinite(bestScore) || bestScore <= 0) return null;

  // Confidence: how much better is the best lag compared to the runner-up.
  // A ratio ≥ 1.15 (15% better) maps to confidence = 1.
  const ratio = secondScore > 0 ? bestScore / secondScore : bestScore > 0 ? 2 : 0;
  const confidence = clamp((ratio - 1) / 0.15, 0, 1);
  return { lag: bestLag, confidence };
}

/**
 * Two-stage cross-correlation:
 *  1. Coarse stage — envelope at COARSE_RATE over ANALYSIS_WINDOW_SECONDS.
 *     Finds the approximate lag within ±maxOffsetMs at ~12ms resolution.
 *  2. Fine stage — raw samples at 48kHz inside ±FINE_HALF_WINDOW_MS around
 *     the coarse result. Refines to ±1 sample (< 0.03ms at 48kHz).
 *
 * Returns offsetMs (positive = voice is ahead of reference = reference needs
 * to be delayed) and confidence.
 */
function correlateCoarseFine(
  refFull: Float32Array,
  refSampleRate: number,
  voiceFull: Float32Array,
  voiceSampleRate: number,
  maxOffsetMs: number,
): { offsetMs: number; confidence: number } | null {
  // ── COARSE STAGE ────────────────────────────────────────────────────────
  const refCoarse = zNormalize(envelope(
    resampleLinear(trimToWindow(refFull, refSampleRate, ANALYSIS_WINDOW_SECONDS), refSampleRate, COARSE_RATE),
  ));
  const voiceCoarse = zNormalize(envelope(
    resampleLinear(trimToWindow(voiceFull, voiceSampleRate, ANALYSIS_WINDOW_SECONDS), voiceSampleRate, COARSE_RATE),
  ));

  // Envelope compresses by windowSize=96, so effective rate ≈ COARSE_RATE/96.
  const envRate = COARSE_RATE / 96;
  const maxLagCoarse = Math.round((maxOffsetMs / 1000) * envRate);
  const coarse = xcorr(refCoarse, voiceCoarse, -maxLagCoarse, maxLagCoarse);
  if (!coarse) return null;

  // Convert coarse lag from envelope-samples to milliseconds.
  const coarseMs = Math.round((coarse.lag / envRate) * 1000);

  // ── FINE STAGE ──────────────────────────────────────────────────────────
  // Use raw 48kHz samples inside a narrow window around the coarse estimate.
  const refFine = zNormalize(trimToWindow(refFull, refSampleRate, ANALYSIS_WINDOW_SECONDS));
  const voiceFine = zNormalize(trimToWindow(voiceFull, voiceSampleRate, ANALYSIS_WINDOW_SECONDS));

  const coarseLagSamples = Math.round((coarseMs / 1000) * refSampleRate);
  const halfWindowSamples = Math.round((FINE_HALF_WINDOW_MS / 1000) * refSampleRate);
  const minLagFine = coarseLagSamples - halfWindowSamples;
  const maxLagFine = coarseLagSamples + halfWindowSamples;

  const fine = xcorr(refFine, voiceFine, minLagFine, maxLagFine);
  if (!fine) {
    // Fall back to coarse result if fine stage fails (e.g. very short audio).
    return { offsetMs: coarseMs, confidence: coarse.confidence * 0.7 };
  }

  const fineLagMs = Math.round((fine.lag / refSampleRate) * 1000);
  // Combined confidence: fine result wins but is tempered by coarse agreement.
  const confidence = fine.confidence * 0.8 + coarse.confidence * 0.2;
  return { offsetMs: fineLagMs, confidence };
}

function goertzelEnergy(samples: Float32Array, sampleRate: number, frequency: number, start: number, size: number) {
  const coeff = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let q0 = 0; let q1 = 0; let q2 = 0;
  const end = Math.min(samples.length, start + size);
  for (let i = start; i < end; i += 1) {
    q0 = coeff * q1 - q2 + samples[i];
    q2 = q1;
    q1 = q0;
  }
  return q1 * q1 + q2 * q2 - coeff * q1 * q2;
}

function detectMarker(samples: Float32Array, sampleRate: number, frequency: number) {
  const frameSize = Math.max(128, Math.round(sampleRate * 0.035));
  const hop = Math.max(64, Math.round(sampleRate * 0.012));
  const limit = Math.min(samples.length - frameSize, Math.round(sampleRate * 1.2));
  let bestEnergy = 0; let bestIndex = -1; let sumEnergy = 0; let frames = 0;
  for (let start = 0; start <= limit; start += hop) {
    const marker = goertzelEnergy(samples, sampleRate, frequency, start, frameSize);
    const low = goertzelEnergy(samples, sampleRate, 700, start, frameSize);
    const high = goertzelEnergy(samples, sampleRate, 2600, start, frameSize);
    const score = marker / Math.max(1e-9, (low + high) / 2);
    sumEnergy += score;
    frames += 1;
    if (score > bestEnergy) { bestEnergy = score; bestIndex = start; }
  }
  const avg = sumEnergy / Math.max(1, frames);
  const confidence = clamp((bestEnergy / Math.max(1, avg) - 4) / 12, 0, 1);
  if (bestIndex < 0 || confidence < 0.45) return null;
  return { timeMs: Math.round((bestIndex / sampleRate) * 1000), confidence };
}

export async function analyzeDuetAutoSync(options: SyncOptions): Promise<DuetAutoSyncResult> {
  const context = new AudioContext({ sampleRate: 48000 });
  const expected = clamp(options.markerExpectedMs ?? MARKER_EXPECTED_MS, -MAX_OFFSET_MS, MAX_OFFSET_MS);
  const maxOffsetMs = options.maxOffsetMs ?? MAX_OFFSET_MS;

  try {
    // ── Decode voice blob ─────────────────────────────────────────────────
    let voiceBuffer: AudioBuffer | null = null;
    try {
      voiceBuffer = await decodeBlob(context, options.voiceBlob);
    } catch {
      return { offsetMs: expected, confidence: 0.9, strategy: 'marker', reason: 'voice_decode_failed_marker_fallback' };
    }

    const voiceMono = toMono(voiceBuffer);

    // ── Marker detection (fast path, no reference decode needed) ──────────
    const voiceCoarseForMarker = resampleLinear(voiceMono, voiceBuffer.sampleRate, COARSE_RATE);
    const marker = detectMarker(voiceCoarseForMarker, COARSE_RATE, options.markerFrequencyHz || MARKER_FREQUENCY);
    if (marker && marker.confidence >= 0.45) {
      return {
        offsetMs: clamp(Math.round(marker.timeMs + expected), -MAX_OFFSET_MS, MAX_OFFSET_MS),
        confidence: marker.confidence,
        strategy: 'marker',
      };
    }

    // ── Two-stage waveform correlation ────────────────────────────────────
    try {
      const referenceBuffer = await decodeUrl(context, options.referenceUrl);
      const refMono = toMono(referenceBuffer);

      const result = correlateCoarseFine(
        refMono, referenceBuffer.sampleRate,
        voiceMono, voiceBuffer.sampleRate,
        maxOffsetMs,
      );

      if (result && result.confidence >= MIN_WAVEFORM_CONFIDENCE) {
        return {
          offsetMs: clamp(result.offsetMs, -MAX_OFFSET_MS, MAX_OFFSET_MS),
          confidence: result.confidence,
          strategy: 'waveform',
        };
      }
    } catch {
      // Reference HLS/MP4 may not be decodable by AudioContext on Safari.
      // The marker expected offset is the safest fallback.
    }

    return { offsetMs: expected, confidence: 0.82, strategy: 'marker', reason: 'marker_expected_fallback' };
  } finally {
    await context.close().catch(() => undefined);
  }
}
