import type { VoiceStudioCaptureHandle } from './voice-studio-recording-capture-lifecycle';
import {
  observeVoiceStudioLegacyRecordingState,
  requestVoiceStudioLegacyRecordingToggle,
  type VoiceStudioLegacyRecordingVisualState,
} from './voice-studio-legacy-recording-intent-bridge';

function waitForState(
  predicate: (state: VoiceStudioLegacyRecordingVisualState) => boolean,
  timeoutMs = 4000,
): Promise<VoiceStudioLegacyRecordingVisualState> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const release = observeVoiceStudioLegacyRecordingState(state => {
      if (settled || !predicate(state)) return;
      settled = true;
      window.clearTimeout(timeout);
      release();
      resolve(state);
    });
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      release();
      reject(new Error('O controlador de gravação não respondeu.'));
    }, timeoutMs);
  });
}

export async function createLegacyRecordingCaptureAdapter(): Promise<VoiceStudioCaptureHandle> {
  const accepted = requestVoiceStudioLegacyRecordingToggle();
  if (!accepted) throw new Error('A gravação não pôde ser iniciada.');
  await waitForState(state => state === 'countin' || state === 'recording');

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    requestVoiceStudioLegacyRecordingToggle();
    await waitForState(state => state === 'idle').catch(() => undefined);
  };

  return {
    stop: close,
    cancel: close,
  };
}
