import { addAssetClipToProject, type VoiceStudioAsset, type VoiceStudioProject, type VoiceStudioTrackKind } from './voice-studio-project-model';

export type VoiceStudioRecordingPunchRange = {
  enabled: boolean;
  in: number | null;
  out: number | null;
};

export type VoiceStudioRecordingSession = {
  id: string;
  trackId: string;
  kind: VoiceStudioTrackKind;
  start: number;
  startedAt: number;
  latencyCompensation: number;
  punch: VoiceStudioRecordingPunchRange;
};

export type VoiceStudioAudioCapture = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  mimeType: string;
};

export type VoiceStudioRecordingCommit = {
  project: VoiceStudioProject;
  asset: VoiceStudioAsset;
  clipId: string;
};

export type CreateRecordingSessionInput = {
  trackId: string;
  kind: VoiceStudioTrackKind;
  start: number;
  latencyCompensation: number;
  punch?: Partial<VoiceStudioRecordingPunchRange>;
};

export type BuildRecordedAudioAssetInput = {
  blob: Blob;
  duration: number;
  peaks: number[];
  fileName?: string;
};

export type CommitRecordingToProjectInput = {
  project: VoiceStudioProject;
  asset: VoiceStudioAsset;
  clipName: string;
  session: VoiceStudioRecordingSession;
};

const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;
const MINIMUM_DURATION_SECONDS = 0.08;

export function supportedRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return AUDIO_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function createRecordingSession(input: CreateRecordingSessionInput): VoiceStudioRecordingSession {
  return {
    id: crypto.randomUUID(),
    trackId: input.trackId,
    kind: input.kind,
    start: Math.max(0, input.start),
    startedAt: performance.now(),
    latencyCompensation: Math.max(0, input.latencyCompensation),
    punch: { enabled: false, in: null, out: null, ...input.punch },
  };
}

export function createAudioCapture(stream: MediaStream): VoiceStudioAudioCapture {
  if (typeof MediaRecorder === 'undefined') throw new Error('Este navegador não oferece MediaRecorder.');
  const mimeType = supportedRecordingMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = event => {
    if (event.data?.size) chunks.push(event.data);
  };
  return { recorder, stream, chunks, mimeType: recorder.mimeType || mimeType };
}

export function buildRecordedAudioAsset(input: BuildRecordedAudioAssetInput): VoiceStudioAsset {
  return {
    id: crypto.randomUUID(),
    kind: 'audio',
    mimeType: input.blob.type || 'audio/webm',
    fileName: input.fileName ?? `recording-${Date.now()}.webm`,
    duration: Math.max(MINIMUM_DURATION_SECONDS, input.duration),
    createdAt: new Date().toISOString(),
    peaks: input.peaks,
    midiNotes: [],
  };
}

export function commitRecordingToProject(input: CommitRecordingToProjectInput): VoiceStudioRecordingCommit {
  const compensatedStart = Math.max(0, input.session.start - input.session.latencyCompensation);
  const project = addAssetClipToProject(input.project, input.asset, input.clipName, compensatedStart, input.session.trackId);
  const clip = project.tracks.find(track => track.id === input.session.trackId)?.clips.find(item => item.assetId === input.asset.id);
  if (!clip) throw new Error('A gravação não pôde ser inserida na track armada.');
  return { project, asset: input.asset, clipId: clip.id };
}
