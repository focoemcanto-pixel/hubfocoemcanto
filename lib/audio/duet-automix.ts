import type { VoicePreset } from './duet-buffer-engine';

export type AutoMixResult = {
  voiceVolume: number;
  referenceVolume: number;
  preset: VoicePreset;
  message: string;
};

type AudioStats = { rms: number; activeRms: number; peak: number };
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const roundToStep = (v: number, s = 5) => Math.round(v / s) * s;

async function decodeBlob(ctx: AudioContext, blob: Blob) {
  const b = await blob.arrayBuffer();
  return ctx.decodeAudioData(b.slice(0));
}

async function decodeUrl(ctx: AudioContext, url: string) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error('reference_fetch_failed');
  const b = await r.arrayBuffer();
  return ctx.decodeAudioData(b.slice(0));
}

function stats(buffer: AudioBuffer): AudioStats {
  const channel = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channel.length / 60000));
  let sum = 0;
  let count = 0;
  let peak = 0;
  const samples: number[] = [];
  for (let i = 0; i < channel.length; i += step) {
    const s = Math.abs(channel[i]);
    peak = Math.max(peak, s);
    sum += s * s;
    count++;
    samples.push(s);
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  const gate = Math.max(0.006, rms * 0.55);
  let activeSum = 0;
  let activeCount = 0;
  for (const s of samples) {
    if (s >= gate) {
      activeSum += s * s;
      activeCount++;
    }
  }
  return { rms, activeRms: Math.sqrt(activeSum / Math.max(1, activeCount)) || rms, peak };
}

function fineTuneVolumes(ratio: number) {
  const targetRatio = 1.08;
  const correction = Math.log2(clamp(ratio / targetRatio, 0.45, 2.4));
  let voiceVolume = 100 - correction * 10;
  let referenceVolume = 100 + correction * 10;
  voiceVolume = roundToStep(clamp(voiceVolume, 70, 100));
  referenceVolume = roundToStep(clamp(referenceVolume, 70, 100));
  return { voiceVolume, referenceVolume };
}

export async function calculateDuetAutoMix(params: { voiceBlob: Blob; referenceBlob?: Blob | null; referenceSource?: string | null; currentPreset?: VoicePreset; }): Promise<AutoMixResult> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('audio_context_missing');
  const ctx = new AudioCtx({ latencyHint: 'playback', sampleRate: 48000 });
  try {
    const [voiceBuffer, referenceBuffer] = await Promise.all([
      decodeBlob(ctx, params.voiceBlob),
      params.referenceBlob ? decodeBlob(ctx, params.referenceBlob) : decodeUrl(ctx, params.referenceSource || ''),
    ]);

    const voice = stats(voiceBuffer);
    const reference = stats(referenceBuffer);
    const ratio = voice.activeRms / Math.max(reference.activeRms, 0.0001);
    let { voiceVolume, referenceVolume } = fineTuneVolumes(ratio);

    if (voice.peak > 0.9) voiceVolume = Math.min(voiceVolume, 90);
    if (voice.activeRms < 0.035 && ratio < 1.1) voiceVolume = Math.max(voiceVolume, 95);

    const preset: VoicePreset = params.currentPreset && params.currentPreset !== 'natural' ? params.currentPreset : 'studio';

    let message = 'Ganhos das faixas normalizados. Ajuste fino aplicado.';
    if (ratio > 1.8) message = 'Sua voz veio com ganho alto. Normalizei a faixa e deixei a referência presente.';
    else if (ratio < 0.8) message = 'Sua voz veio baixa. Normalizei a faixa sem exagerar o volume.';

    return { voiceVolume, referenceVolume, preset, message };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
