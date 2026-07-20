import { createAudioCapture, type VoiceStudioAudioCapture } from './voice-studio-recording-engine';

export type VoiceStudioBrowserRecordingResult = {
  blob: Blob;
  mimeType: string;
};

export type VoiceStudioBrowserRecordingAdapter = {
  readonly stream: MediaStream;
  readonly recorder: MediaRecorder;
  stop(): Promise<VoiceStudioBrowserRecordingResult>;
  cancel(): Promise<void>;
  dispose(): Promise<void>;
};

export type CreateVoiceStudioBrowserRecordingAdapterOptions = {
  constraints?: MediaStreamConstraints;
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
};

const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  video: false,
};

export async function createVoiceStudioBrowserRecordingAdapter(
  options: CreateVoiceStudioBrowserRecordingAdapterOptions = {},
): Promise<VoiceStudioBrowserRecordingAdapter> {
  const mediaDevices = options.mediaDevices ?? navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) {
    throw new Error('Este navegador não oferece captura de áudio.');
  }

  const stream = await mediaDevices.getUserMedia(options.constraints ?? DEFAULT_CONSTRAINTS);
  let capture: VoiceStudioAudioCapture;

  try {
    capture = createAudioCapture(stream);
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    throw error;
  }

  let settled = false;
  let disposed = false;

  const stopTracks = () => {
    if (disposed) return;
    disposed = true;
    stream.getTracks().forEach(track => track.stop());
  };

  const buildResult = (): VoiceStudioBrowserRecordingResult => ({
    blob: new Blob(capture.chunks, { type: capture.mimeType || capture.recorder.mimeType || 'audio/webm' }),
    mimeType: capture.mimeType || capture.recorder.mimeType || 'audio/webm',
  });

  const waitForStop = (): Promise<VoiceStudioBrowserRecordingResult> => new Promise((resolve, reject) => {
    const recorder = capture.recorder;

    const cleanup = () => {
      recorder.removeEventListener('stop', handleStop);
      recorder.removeEventListener('error', handleError);
    };

    const handleStop = () => {
      cleanup();
      settled = true;
      resolve(buildResult());
    };

    const handleError = (event: Event) => {
      cleanup();
      settled = true;
      const error = event instanceof ErrorEvent ? event.error : null;
      reject(error instanceof Error ? error : new Error('A gravação foi interrompida pelo navegador.'));
    };

    recorder.addEventListener('stop', handleStop, { once: true });
    recorder.addEventListener('error', handleError, { once: true });

    if (recorder.state === 'inactive') handleStop();
    else recorder.stop();
  });

  capture.recorder.start();

  return {
    stream,
    recorder: capture.recorder,
    async stop() {
      if (settled) return buildResult();
      try {
        return await waitForStop();
      } finally {
        stopTracks();
      }
    },
    async cancel() {
      if (!settled && capture.recorder.state !== 'inactive') capture.recorder.stop();
      settled = true;
      capture.chunks.splice(0, capture.chunks.length);
      stopTracks();
    },
    async dispose() {
      if (!settled && capture.recorder.state !== 'inactive') capture.recorder.stop();
      stopTracks();
    },
  };
}
