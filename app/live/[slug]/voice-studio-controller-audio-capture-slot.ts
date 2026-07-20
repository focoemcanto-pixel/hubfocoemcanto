import type { VoiceStudioLegacyAudioCaptureFacade } from './voice-studio-legacy-audio-capture-facade';

export type VoiceStudioControllerAudioCaptureSlot = {
  current: VoiceStudioLegacyAudioCaptureFacade | null;
};

export function createVoiceStudioControllerAudioCaptureSlot(): VoiceStudioControllerAudioCaptureSlot {
  return { current: null };
}
