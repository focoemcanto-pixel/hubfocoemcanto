import type { DuetFaderValues } from './duet-audio-engine';

export type DuetLeakMode = 'headphones' | 'light-leak' | 'speaker-leak' | 'unknown';

export type DuetSmartMixAnalysis = {
  leakScore: number;
  mode: DuetLeakMode;
  voiceRmsDb: number;
  voicePeakDb: number;
  suggestedFaders: DuetFaderValues;
  suggestedPreset: 'natural' | 'studio' | 'coral' | 'worship';
  summary: string;
};

type AnalyzeOptions = {
  voiceBlob: Blob;
  referenceUrl: string;
  sampleRate?: number;
  seconds?: number;
};

const DEFAULT_SAMPLE_RATE = 16000;

function withFullMedia(url: string) {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}full=1`;
}

async function createAudioContext(sampleRate: number) {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('audio_context_missing');
  return new Ctor({ sampleRate });
}

async function decodeBlob(blob: Blob, sampleRate: number) {
  const context = await createAudioContext(sampleRate);
  try {
    const buffer = await blob.arrayBuffer();
    return await context.decodeAudioData(buffer.slice(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function decodeUrl(url: string, sampleRate: number) {
  const response = await fetch(withFullMedia(url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`reference_fetch_failed:${response.status}`);
  return decodeBlob(await response.blob(), sampleRate);
}

function mixToMono(buffer: AudioBuffer, seconds: number, targetRate: number) {
  const sourceRate = buffer.sampleRate;
  const length = Math.min(buffer.length, Math.max(1, Math.floor(seconds * sourceRate)));
  const outLength = Math.max(1, Math.floor((length / sourceRate) * targetRate));
  const output = new Float32Array(outLength);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  for (let i = 0; i < outLength; i += 1) {
    const sourceIndex = Math.min(length - 1, Math.floor((i / targetRate) * sourceRate));
    let sum = 0;
    for (const channel of channels) sum += channel[sourceIndex] || 0;
    output[i] = sum / Math.max(1, channels.length);
  }
  return output;
}

function rmsDb(samples: Float32Array) {
  if (!samples.length) return -120;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  return 20 * Math.log10(Math.max(0.000001, rms));
}

function peakDb(samples: Float32Array) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return 20 * Math.log10(Math.max(0.000001, peak));
}

function normalize(samples: Float32Array) {
  const rms = Math.pow(10, rmsDb(samples) / 20);
  if (rms < 0.00001) return samples;
  const output = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) output[i] = samples[i] / rms;
  return output;
}

function correlation(a: Float32Array, b: Float32Array) {
  const length = Math.min(a.length, b.length);
  if (length < 256) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < length; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    aa += av * av;
    bb += bv * bv;
  }
  if (aa <= 0 || bb <= 0) return 0;
  return Math.abs(dot / Math.sqrt(aa * bb));
}

function bestLeakScore(voice: Float32Array, reference: Float32Array, sampleRate: number) {
  const normalizedVoice = normalize(voice);
  const normalizedReference = normalize(reference);
  const maxLag = Math.floor(sampleRate * 0.35);
  const step = Math.max(1, Math.floor(sampleRate * 0.01));
  let best = 0;
  for (let lag = 0; lag <= maxLag; lag += step) {
    const voiceSlice = normalizedVoice.subarray(lag);
    const referenceSlice = normalizedReference.subarray(0, voiceSlice.length);
    best = Math.max(best, correlation(voiceSlice, referenceSlice));
  }
  return Math.max(0, Math.min(1, best));
}

function classifyLeak(score: number): DuetLeakMode {
  if (!Number.isFinite(score)) return 'unknown';
  if (score >= 0.35) return 'speaker-leak';
  if (score >= 0.16) return 'light-leak';
  return 'headphones';
}

function suggestMix(mode: DuetLeakMode, voiceRms: number): Pick<DuetSmartMixAnalysis, 'suggestedFaders' | 'suggestedPreset' | 'summary'> {
  const lowVoiceBoost = voiceRms < -32 ? 125 : voiceRms < -25 ? 115 : 105;
  if (mode === 'speaker-leak') {
    return {
      suggestedFaders: { voice: lowVoiceBoost, reference: 0 },
      suggestedPreset: 'natural',
      summary: 'Detectei vazamento da referência no microfone. Para evitar eco, deixei a referência externa mutada.',
    };
  }
  if (mode === 'light-leak') {
    return {
      suggestedFaders: { voice: lowVoiceBoost, reference: 12 },
      suggestedPreset: 'natural',
      summary: 'Detectei um vazamento leve da referência. Mantive só um pouco da referência para evitar reverberação.',
    };
  }
  return {
    suggestedFaders: { voice: Math.max(100, lowVoiceBoost - 10), reference: 70 },
    suggestedPreset: 'studio',
    summary: 'Gravação parece estar com fone. Mantive a referência audível para a mixagem.',
  };
}

export async function analyzeDuetSmartMix(options: AnalyzeOptions): Promise<DuetSmartMixAnalysis> {
  const sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
  const seconds = options.seconds || 3;
  const [voiceBuffer, referenceBuffer] = await Promise.all([
    decodeBlob(options.voiceBlob, sampleRate),
    decodeUrl(options.referenceUrl, sampleRate),
  ]);
  const voice = mixToMono(voiceBuffer, seconds, sampleRate);
  const reference = mixToMono(referenceBuffer, seconds, sampleRate);
  const leakScore = bestLeakScore(voice, reference, sampleRate);
  const mode = classifyLeak(leakScore);
  const voiceRms = rmsDb(voice);
  const suggestion = suggestMix(mode, voiceRms);
  return {
    leakScore,
    mode,
    voiceRmsDb: voiceRms,
    voicePeakDb: peakDb(voice),
    ...suggestion,
  };
}
