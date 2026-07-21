import type { VoiceStudioAssetStore } from './voice-studio-asset-store';
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
import type { VoiceStudioTransportController } from './voice-studio-transport-controller';

export type VoiceStudioPlaybackConfiguration = Pick<
  VoiceStudioRuntimePlaybackCallbacks,
  'midiFrequency' | 'instrumentWave'
>;

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
  transport: VoiceStudioTransportController;
  assetStore: VoiceStudioAssetStore;
  runtime: VoiceStudioRuntime;
};

export type CreateVoiceStudioSessionOptions = {
  playbackCallbacks: VoiceStudioPlaybackConfiguration;
  project?: VoiceStudioProject;
  historyLimit?: number;
  selection?: VoiceStudioSelectionState;
  transport?: VoiceStudioTransportController;
  assetStore?: VoiceStudioAssetStore;
  runtime?: VoiceStudioRuntime;
  runtimeOptions?: CreateVoiceStudioRuntimeOptions;
};
