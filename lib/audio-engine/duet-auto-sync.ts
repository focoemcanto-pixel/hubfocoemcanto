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

const TARGET_RATE = 8000;
const MARKER_FREQUENCY = 1760;
const MARKER_EXPECTED_MS = 220;
const MAX_OFFSET_MS = 900;

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

function toMono(buffer: AudioBuffer) {
  const length = buffer.length;
  const output = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) output[i] += data[i] / buffer.numberOfChannels;
  }
  return output;
}

function resampleLinear(input: Float32Array, fromRate: number, toRate = TARGET_RATE) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const frac = pos - index;
    const a = input[index] || 0;
    const b = input[index + 1] || a;
    output[i] = a + (b - a) * frac;
  }
  return output;
}

function envelope(samples: Float32Array, windowSize = 96) {
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

function normalize(samples: Float32Array) {
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

function goertzelEnergy(samples: Float32Array, sampleRate: number, frequency: number, start: number, size: number) {
  const coeff = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
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
  let bestEnergy = 0;
  let bestIndex = -1;
  let sumEnergy = 0;
  let frames = 0;
  for (let start = 0; start <= limit; start += hop) {
    const marker = goertzelEnergy(samples, sampleRate, frequency, start, frameSize);
    const low = goertzelEnergy(samples, sampleRate, 700, start, frameSize);
    const high = goertzelEnergy(samples, sampleRate, 2600, start, frameSize);
    const score = marker / Math.max(1e-9, (low + high) / 2);
    sumEnergy += score;
    frames += 1;
    if (score > bestEnergy) {
      bestEnergy = score;
      bestIndex = start;
    }
  }
  const avg = sumEnergy / Math.max(1, frames);
  const confidence = clamp((bestEnergy / Math.max(1, avg) - 4) / 12, 0, 1);
  if (bestIndex < 0 || confidence < 0.45) return null;
  return { timeMs: Math.round((bestIndex / sampleRate) * 1000), confidence };
}

function correlate(reference: Float32Array, voice: Float32Array, sampleRate: number, maxOffsetMs: number) {
  const refEnv = normalize(envelope(reference));
  const voiceEnv = normalize(envelope(voice));
  const envRate = sampleRate / 96;
  const maxLag = Math.round((maxOffsetMs / 1000) * envRate);
  const searchLength = Math.min(refEnv.length, voiceEnv.length, Math.round(envRate * 30));
  if (searchLength < Math.round(envRate * 2)) return null;
  let bestLag = 0;
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < searchLength; i += 1) {
      const voiceIndex = i + lag;
      if (voiceIndex < 0 || voiceIndex >= voiceEnv.length) continue;
      sum += refEnv[i] * voiceEnv[voiceIndex];
      count += 1;
    }
    if (count < searchLength * 0.45) continue;
    const score = sum / count;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestLag = lag;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  if (!Number.isFinite(bestScore)) return null;
  const margin = bestScore - secondScore;
  const confidence = clamp((bestScore + margin * 4 + 0.15) / 0.9, 0, 1);
  return { offsetMs: Math.round((bestLag / envRate) * 1000), confidence };
}

export async function analyzeDuetAutoSync(options: SyncOptions): Promise<DuetAutoSyncResult> {
  const context = new AudioContext({ sampleRate: 48000 });
  const expected = clamp(options.markerExpectedMs ?? MARKER_EXPECTED_MS, -MAX_OFFSET_MS, MAX_OFFSET_MS);
  try {
    let voiceBuffer: AudioBuffer | null = null;
    try {
      voiceBuffer = await decodeBlob(context, options.voiceBlob);
    } catch {
      return { offsetMs: expected, confidence: 0.9, strategy: 'marker', reason: 'voice_decode_failed_marker_fallback' };
    }

    const voice = resampleLinear(toMono(voiceBuffer), voiceBuffer.sampleRate, TARGET_RATE);
    const marker = detectMarker(voice, TARGET_RATE, options.markerFrequencyHz || MARKER_FREQUENCY);
    if (marker && marker.confidence >= 0.45) {
      return {
        offsetMs: clamp(Math.round(marker.timeMs + expected), -MAX_OFFSET_MS, MAX_OFFSET_MS),
        confidence: marker.confidence,
        strategy: 'marker',
      };
    }

    try {
      const referenceBuffer = await decodeUrl(context, options.referenceUrl);
      const reference = resampleLinear(toMono(referenceBuffer), referenceBuffer.sampleRate, TARGET_RATE);
      const waveform = correlate(reference, voice, TARGET_RATE, options.maxOffsetMs ?? MAX_OFFSET_MS);
      if (waveform && waveform.confidence >= 0.22) {
        return {
          offsetMs: clamp(waveform.offsetMs, -MAX_OFFSET_MS, MAX_OFFSET_MS),
          confidence: waveform.confidence,
          strategy: 'waveform',
        };
      }
    } catch {
      // Reference HLS/MP4 may not be decodable by AudioContext on Safari. The marker offset is still the safest fallback.
    }

    return { offsetMs: expected, confidence: 0.82, strategy: 'marker', reason: 'marker_expected_fallback' };
  } finally {
    await context.close().catch(() => undefined);
  }
}
