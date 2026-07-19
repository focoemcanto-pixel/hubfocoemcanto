import type { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import type { VoiceStudioPlaybackCallbacks, VoiceStudioPlaybackEngine } from './voice-studio-playback-engine';
import type { VoiceStudioProject } from './voice-studio-project-model';
import type {
  buildRecordedAudioAsset,
  commitRecordingToProject,
  createAudioCapture,
  createRecordingSession,
  supportedRecordingMimeType,
} from './voice-studio-recording-engine';
import type { VoiceStudioSelectionState } from './voice-studio-selection-engine';

export type VoiceStudioTransportStatus = 'idle' | 'countin' | 'recording' | 'playing';

export type VoiceStudioTransport = {
  status: VoiceStudioTransportStatus;
  position: number;
};

export type VoiceStudioAssetStore = {
  blobs: Map<string, Blob>;
  objectUrls: Map<string, string>;
};

export type VoiceStudioRuntime = {
  audioContext: AudioContext | null;
  disposed: boolean;
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
  playbackCallbacks: VoiceStudioPlaybackCallbacks;
  project?: VoiceStudioProject;
  historyLimit?: number;
  selection?: VoiceStudioSelectionState;
  transport?: VoiceStudioTransport;
  assetStore?: VoiceStudioAssetStore;
  runtime?: VoiceStudioRuntime;
};
