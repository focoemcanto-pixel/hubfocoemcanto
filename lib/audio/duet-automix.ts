import type { VoicePreset } from './duet-buffer-engine';

export type AutoMixResult = { voiceVolume: number; referenceVolume: number; preset: VoicePreset; message: string };
type AudioStats = { rms: number; activeRms: number; peak: number };
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const roundToStep = (v: number, s = 5) => Math.round(v / s) * s;
async function decodeBlob(ctx: AudioContext, blob: Blob) { const b = await blob.arrayBuffer(); return ctx.decodeAudioData(b.slice(0)); }
async function decodeUrl(ctx: AudioContext, url: string) { const r = await fetch(url, { cache: 'force-cache' }); if (!r.ok) throw new Error('reference_fetch_failed'); const b = await r.arrayBuffer(); return ctx.decodeAudioData(b.slice(0)); }

function stats(buffer: AudioBuffer): AudioStats {
  const channel = buffer.getChannelData(0); const step = Math.max(1, Math.floor(channel.length / 60000)); let sum = 0; let count = 0; let peak = 0; const samples: number[] = [];
  for (let i = 0; i < channel.length; i += step) { const s = Math.abs(channel[i]); peak = Math.max(peak, s); sum += s * s; count++; samples.push(s); }
  const rms = Math.sqrt(sum / Math.max(1, count)); const gate = Math.max(0.006, rms * 0.55); let activeSum = 0; let activeCount = 0;
  for (const s of samples) if (s >= gate) { activeSum += s * s; activeCount++; }
  return { rms, activeRms: Math.sqrt(activeSum / Math.max(1, activeCount)) || rms, peak };
}

function pre(activeRms: number, targetRms: number, min: number, max: number) {
  if (!Number.isFinite(activeRms) || activeRms <= 0.0001) return 1;
  return clamp(targetRms / activeRms, min, max);
}

function fineTune(ratio: number) {
  const correction = Math.log2(clamp(ratio / 1.02, 0.55, 1.85));
  return {
    voiceVolume: roundToStep(clamp(100 - correction * 8, 82, 100)),
    referenceVolume: roundToStep(clamp(100 + correction * 8, 82, 100)),
  };
}

export async function calculateDuetAutoMix(params: { voiceBlob: Blob; referenceBlob?: Blob | null; referenceSource?: string | null; currentPreset?: VoicePreset; }): Promise<AutoMixResult> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('audio_context_missing');
  const ctx = new AudioCtx({ latencyHint: 'playback', sampleRate: 48000 });
  try {
    const [voiceBuffer, referenceBuffer] = await Promise.all([decodeBlob(ctx, params.voiceBlob), params.referenceBlob ? decodeBlob(ctx, params.referenceBlob) : decodeUrl(ctx, params.referenceSource || '')]);
    const voice = stats(voiceBuffer); const reference = stats(referenceBuffer);
    const vPre = pre(voice.activeRms, 0.045, 0.04, 1.6);
    const rPre = pre(reference.activeRms, 0.13, 0.65, 7.2);
    const normalizedRatio = (voice.activeRms * vPre) / Math.max(reference.activeRms * rPre, 0.0001);
    let { voiceVolume, referenceVolume } = fineTune(normalizedRatio);
    if (voice.peak > 0.9) voiceVolume = Math.min(voiceVolume, 92);
    const preset: VoicePreset = params.currentPreset && params.currentPreset !== 'natural' ? params.currentPreset : 'studio';
    return { voiceVolume, referenceVolume, preset, message: 'Faixas normalizadas. Ajuste fino aplicado.' };
  } finally { await ctx.close().catch(() => undefined); }
}
