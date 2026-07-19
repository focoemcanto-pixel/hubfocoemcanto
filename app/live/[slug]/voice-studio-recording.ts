import { addAssetClipToProject, type VoiceStudioAsset, type VoiceStudioMidiNote, type VoiceStudioProject, type VoiceStudioTrackKind } from './voice-studio-project-model';
import type { VoiceStudioAssetStore } from './voice-studio-asset-store';
import type { VoiceStudioRuntime } from './voice-studio-runtime';
import type { VoiceStudioTransportController } from './voice-studio-transport-controller';

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

export type BeginVoiceStudioRecordingInput = {
  trackId: string;
  kind: VoiceStudioTrackKind;
  latencyCompensation?: number;
};

export type CommitVoiceStudioAudioRecordingInput = {
  blob: Blob;
  duration: number;
  peaks: number[];
  clipName: string;
  fileName?: string;
  session: VoiceStudioRecordingSession;
};

export type CommitVoiceStudioMidiRecordingInput = {
  notes: VoiceStudioMidiNote[];
  duration: number;
  clipName: string;
  instrument?: string;
  session: VoiceStudioRecordingSession;
};

const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;
const MINIMUM_DURATION_SECONDS = 0.08;

function supportedRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return AUDIO_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
}

export class VoiceStudioRecording {
  readonly #runtime: VoiceStudioRuntime;
  readonly #project: VoiceStudioProject;
  readonly #assetStore: VoiceStudioAssetStore;
  readonly #transport: VoiceStudioTransportController;

  constructor(
    runtime: VoiceStudioRuntime,
    project: VoiceStudioProject,
    assetStore: VoiceStudioAssetStore,
    transport: VoiceStudioTransportController,
  ) {
    this.#runtime = runtime;
    this.#project = project;
    this.#assetStore = assetStore;
    this.#transport = transport;
  }

  supportedMimeType(): string {
    return supportedRecordingMimeType();
  }

  async begin(input: BeginVoiceStudioRecordingInput): Promise<VoiceStudioRecordingSession> {
    await this.#runtime.resume();
    const transport = this.#transport.getSnapshot();
    const punch = transport.punch;
    const start = punch.enabled && punch.in != null ? punch.in : transport.playhead;
    const session: VoiceStudioRecordingSession = {
      id: crypto.randomUUID(),
      trackId: input.trackId,
      kind: input.kind,
      start: Math.max(0, start),
      startedAt: performance.now(),
      latencyCompensation: Math.max(0, input.latencyCompensation ?? 0),
      punch: { ...punch },
    };
    if (transport.countInBars > 0) this.#transport.beginCountIn();
    else this.#transport.beginRecording();
    return session;
  }

  startAfterCountIn(): void {
    this.#transport.beginRecording();
  }

  createAudioCapture(stream: MediaStream): VoiceStudioAudioCapture {
    if (typeof MediaRecorder === 'undefined') throw new Error('Este navegador não oferece MediaRecorder.');
    const mimeType = supportedRecordingMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => {
      if (event.data?.size) chunks.push(event.data);
    };
    return { recorder, stream, chunks, mimeType: recorder.mimeType || mimeType };
  }

  commitAudio(input: CommitVoiceStudioAudioRecordingInput): VoiceStudioRecordingCommit {
    const asset: VoiceStudioAsset = {
      id: crypto.randomUUID(),
      kind: 'audio',
      mimeType: input.blob.type || 'audio/webm',
      fileName: input.fileName ?? `recording-${Date.now()}.webm`,
      duration: Math.max(MINIMUM_DURATION_SECONDS, input.duration),
      createdAt: new Date().toISOString(),
      peaks: input.peaks,
      midiNotes: [],
    };
    this.#assetStore.registerAsset(asset, input.blob);
    return this.#commitAsset(asset, input.clipName, input.session);
  }

  commitMidi(input: CommitVoiceStudioMidiRecordingInput): VoiceStudioRecordingCommit {
    const asset: VoiceStudioAsset = {
      id: crypto.randomUUID(),
      kind: 'midi',
      duration: Math.max(MINIMUM_DURATION_SECONDS, input.duration),
      createdAt: new Date().toISOString(),
      peaks: [],
      midiNotes: input.notes,
      instrument: input.instrument,
    };
    this.#assetStore.registerAsset(asset);
    return this.#commitAsset(asset, input.clipName, input.session);
  }

  cancel(playhead = this.#transport.getSnapshot().playhead): void {
    this.#transport.endRecording(playhead);
  }

  #commitAsset(
    asset: VoiceStudioAsset,
    clipName: string,
    session: VoiceStudioRecordingSession,
  ): VoiceStudioRecordingCommit {
    const compensatedStart = Math.max(0, session.start - session.latencyCompensation);
    const next = addAssetClipToProject(this.#project, asset, clipName, compensatedStart, session.trackId);
    const clip = next.tracks.find(track => track.id === session.trackId)?.clips.find(item => item.assetId === asset.id);
    if (!clip) {
      this.#assetStore.remove(asset.id);
      throw new Error('A gravação não pôde ser inserida na track armada.');
    }
    Object.assign(this.#project, next);
    this.#transport.endRecording(compensatedStart + asset.duration);
    return { project: this.#project, asset, clipId: clip.id };
  }
}

export function createVoiceStudioRecording(
  runtime: VoiceStudioRuntime,
  project: VoiceStudioProject,
  assetStore: VoiceStudioAssetStore,
  transport: VoiceStudioTransportController,
): VoiceStudioRecording {
  return new VoiceStudioRecording(runtime, project, assetStore, transport);
}
