import type { VoicePreset } from './duet-buffer-engine';

export type AutoMixResult = {
  voiceVolume: number;
  referenceVolume: number;
  preset: VoicePreset;
  message: string;
};

type AudioStats = {
  rms: number;
  activeRms: number;
  peak: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step = 5) {
  return Math.round(value / step) * step;
}

async function decodeBlob(ctx: AudioContext, blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer.slice(0));
}

async function decodeUrl(ctx: AudioContext, url: string) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error('reference_fetch_failed');
  const arrayBuffer = await response.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer.slice(0));
}

function stats(buffer: AudioBuffer): AudioStats {
  const channel = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channel.length / 60000));
  let sum = 0;
  let count = 0;
  let peak = 0;
  const samples: number[] = [];

  for (let index = 0; index < channel.length; index += step) {
    const sample = Math.abs(channel[index]);
    peak = Math.max(peak, sample);
    sum += sample * sample;
    count += 1;
    samples.push(sample);
  }

  const rms = Math.sqrt(sum / Math.max(1, count));
  const gate = Math.max(0.006, rms * 0.55);
  let activeSum = 0;
  let activeCount = 0;
  for (const sample of samples) {
    if (sample >= gate) {
      activeSum += sample * sample;
      activeCount += 1;
    }
  }

  return {
    rms,
    activeRms: Math.sqrt(activeSum / Math.max(1, activeCount)) || rms,
    peak,
  };
}

export async function calculateDuetAutoMix(params: {
  voiceBlob: Blob;
  referenceBlob?: Blob | null;
  referenceSource?: string | null;
  currentPreset?: VoicePreset;
}): Promise<AutoMixResult> {
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

    // Voz precisa ficar naturalmente à frente da referência no dueto.
    // Os alvos abaixo evitam resultados extremos e preservam margem contra clipping.
    const targetVoice = 0.13;
    const targetReference = 0.055;
    const voiceBase = (targetVoice / Math.max(voice.activeRms, 0.008)) * 100;
    const referenceBase = (targetReference / Math.max(reference.activeRms, 0.01)) * 100;

    let voiceVolume = clamp(voiceBase, 85, 185);
    let referenceVolume = clamp(referenceBase, 35, 90);

    if (voice.peak > 0.82) voiceVolume = Math.min(voiceVolume, 115);
    if (voice.activeRms < 0.045) voiceVolume = Math.max(voiceVolume, 145);
    if (reference.activeRms > voice.activeRms * 1.35) referenceVolume = Math.min(referenceVolume, 60);
    if (reference.activeRms < 0.035) referenceVolume = Math.max(referenceVolume, 62);

    voiceVolume = roundToStep(voiceVolume);
    referenceVolume = roundToStep(referenceVolume);

    const preset: VoicePreset = params.currentPreset && params.currentPreset !== 'natural' ? params.currentPreset : 'studio';
    const message = voice.activeRms < 0.045
      ? 'Voz baixa detectada. Aumentei sua voz e segurei a referência.'
      : reference.activeRms > voice.activeRms * 1.15
        ? 'Referência forte detectada. Equilibrei para sua voz aparecer mais.'
        : 'Mix equilibrada automaticamente.';

    return { voiceVolume, referenceVolume, preset, message };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
