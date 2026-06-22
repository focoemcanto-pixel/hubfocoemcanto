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

function balancedVisibleVolumes(ratio: number) {
  const targetRatio = 1.2;
  const rawCorrection = Math.log2(clamp(ratio / targetRatio, 0.35, 2.85));
  const visualSpread = clamp(rawCorrection * 16, -18, 18);

  let voiceVolume = 100 - visualSpread;
  let referenceVolume = 100 + visualSpread;

  // Mantém os controles bonitos e proporcionais: ambos perto de 100,
  // mas ainda corrige a relação real entre voz e referência.
  const maxGap = 30;
  const gap = Math.abs(referenceVolume - voiceVolume);
  if (gap > maxGap) {
    const center = (voiceVolume + referenceVolume) / 2;
    const sign = referenceVolume > voiceVolume ? 1 : -1;
    voiceVolume = center - sign * (maxGap / 2);
    referenceVolume = center + sign * (maxGap / 2);
  }

  return {
    voiceVolume: roundToStep(clamp(voiceVolume, 82, 118)),
    referenceVolume: roundToStep(clamp(referenceVolume, 82, 118)),
  };
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
    let { voiceVolume, referenceVolume } = balancedVisibleVolumes(ratio);

    if (voice.peak > 0.9) voiceVolume = Math.min(voiceVolume, 95);
    if (voice.activeRms < 0.035 && ratio < 1.1) voiceVolume = Math.max(voiceVolume, 112);

    const preset: VoicePreset = params.currentPreset && params.currentPreset !== 'natural' ? params.currentPreset : 'studio';

    let message = 'Mix equilibrada automaticamente.';
    if (ratio > 1.8) message = 'Sua voz estava acima da referência. Equilibrei os dois volumes.';
    else if (ratio < 0.8) message = 'Sua voz estava baixa. Ajustei a presença vocal sem exagerar.';

    return { voiceVolume, referenceVolume, preset, message };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
