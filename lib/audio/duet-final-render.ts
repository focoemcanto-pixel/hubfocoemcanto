import type { VoicePreset } from './duet-buffer-engine';

export type FinalRenderSettings = {
  voiceVolume: number;
  referenceVolume: number;
  preset: VoicePreset;
};

export async function renderFinalDuetMix(
  voiceBlob: Blob,
  referenceBlob: Blob,
  settings: FinalRenderSettings,
) {
  return {
    voiceBlob,
    referenceBlob,
    settings,
    rendered: false,
    stage: 'scaffold',
  };
}

export function normalizeVoiceTarget(volume: number) {
  return Math.max(0, Math.min(2.5, volume / 100));
}

export function referenceTarget(volume: number) {
  return Math.max(0, Math.min(1.5, volume / 100));
}
