import {
  createVoiceStudioBrowserAudioInputSession,
  type VoiceStudioBrowserAudioInputSession,
} from './voice-studio-browser-audio-input-session';

export type VoiceStudioLegacyAudioCaptureFrame = {
  meter: number;
  peak: number;
};

export type VoiceStudioLegacyAudioCaptureFacade = {
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  stop(): Promise<{ blob: Blob; mimeType: string }>;
  cancel(): Promise<void>;
  dispose(): Promise<void>;
};

export type CreateVoiceStudioLegacyAudioCaptureFacadeOptions = {
  audioContext: AudioContext;
  deviceId?: string | null;
  monitor: boolean;
  onFrame(frame: VoiceStudioLegacyAudioCaptureFrame): void;
};

export async function createVoiceStudioLegacyAudioCaptureFacade(
  options: CreateVoiceStudioLegacyAudioCaptureFacadeOptions,
): Promise<VoiceStudioLegacyAudioCaptureFacade> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  };

  const session: VoiceStudioBrowserAudioInputSession = await createVoiceStudioBrowserAudioInputSession({
    audioContext: options.audioContext,
    constraints,
    monitor: options.monitor,
    monitorGain: 0.75,
    onFrame: options.onFrame,
  });

  return {
    recorder: session.recorder,
    stream: session.stream,
    stop: () => session.stop(),
    cancel: () => session.cancel(),
    dispose: () => session.dispose(),
  };
}
