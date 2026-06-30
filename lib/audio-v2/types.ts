export type DuetV2RecorderKind = 'camera' | 'canvas' | 'voice' | 'reference' | 'mixed';

export type DuetV2BlobMap = {
  cameraBlob: Blob | null;
  canvasBlob: Blob | null;
  voiceBlob: Blob | null;
  referenceBlob: Blob | null;
  mixedBlob: Blob | null;
};

export type DuetV2RecordingResult = DuetV2BlobMap & {
  startedAt: number;
  stoppedAt: number;
  durationMs: number;
  mimeTypes: Partial<Record<DuetV2RecorderKind, string>>;
  diagnostics: {
    cameraChunks: number;
    canvasChunks: number;
    voiceChunks: number;
    referenceChunks: number;
    mixedChunks: number;
    hasReferenceTrack: boolean;
    hasMicrophoneTrack: boolean;
    hasCanvasVideoTrack: boolean;
  };
};

export type DuetV2MediaRefs = {
  camera: HTMLVideoElement | null;
  reference: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
};

export type DuetV2PrepareOptions = {
  referenceUrl: string;
  audioDeviceId?: string | null;
  width?: number;
  height?: number;
  frameRate?: number;
};

export type DuetV2Session = {
  refs: DuetV2MediaRefs;
  referenceUrl: string;
  cameraStream: MediaStream;
  canvasStream: MediaStream;
  microphoneStream: MediaStream;
  referenceStream: MediaStream | null;
  mixedStream: MediaStream | null;
  audioContext: AudioContext | null;
  startedAt: number;
  stop: () => Promise<DuetV2RecordingResult>;
};
