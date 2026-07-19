import type { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import type { VoiceStudioPlaybackEngine } from './voice-studio-playback-engine';
import type { VoiceStudioProject } from './voice-studio-project-model';
import type {
  buildRecordedAudioAsset,
  commitRecordingToProject,
  createAudioCapture,
  createRecordingSession,
  supportedRecordingMimeType,
} from './voice-studio-recording-engine';
import type {
  VoiceStudioRuntime,
  CreateVoiceStudioRuntimeOptions,
  VoiceStudioRuntimePlaybackCallbacks,
} from './voice-studio-runtime';
import type { VoiceStudioSelectionState } from './voice-studio-selection-engine';

export type VoiceStudioTransportStatus = 'idle' | 'countin' | 'recording' | 'playing';

export type VoiceStudioTransport = {
  status: VoiceStudioTransportStatus;
  position: number;
};

export type VoiceStudioAssetStore = {
  blobs: Map<string, Blob>;
};

export type VoiceStudioRecording = {
  supportedRecordingMimeType: typeof supportedRecordingMimeType;
  createRecordingSession: typeof createRecordingSession;
  createAudioCapture: typeof createAudioCapture;
  buildRecordedAudioAsset: typeof buildRecordedAudioAsset;
  commitRecordingToProject: typeof commitRecordingToProject;
};

export type VoiceStudioSession = {
  project: VoiceStudioProject;
  history: VoiceStudioHistoryEngine;
  selection: VoiceStudioSelectionState;
  playback: VoiceStudioPlaybackEngine;
  recording: VoiceStudioRecording;
  transport: VoiceStudioTransport;
  assetStore: VoiceStudioAssetStore;
  runtime: VoiceStudioRuntime;
};

export type CreateVoiceStudioSessionOptions = {
  playbackCallbacks: VoiceStudioRuntimePlaybackCallbacks;
  project?: VoiceStudioProject;
  historyLimit?: number;
  selection?: VoiceStudioSelectionState;
  transport?: VoiceStudioTransport;
  assetStore?: VoiceStudioAssetStore;
  runtime?: VoiceStudioRuntime;
  runtimeOptions?: CreateVoiceStudioRuntimeOptions;
};
