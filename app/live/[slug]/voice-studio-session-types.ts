import type { VoiceStudioAssetStore } from './voice-studio-asset-store';
import type { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import type { VoiceStudioPlayback } from './voice-studio-playback';
import type { VoiceStudioProject } from './voice-studio-project-model';
import type {
  buildRecordedAudioAsset,
  commitRecordingToProject,
  createAudioCapture,
  createRecordingSession,
  supportedRecordingMimeType,
} from './voice-studio-recording-engine';
import type { VoiceStudioRuntime, CreateVoiceStudioRuntimeOptions } from './voice-studio-runtime';
import type { VoiceStudioSelectionState } from './voice-studio-selection-engine';
import type { VoiceStudioTransportController } from './voice-studio-transport-controller';

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
  playback: VoiceStudioPlayback;
  recording: VoiceStudioRecording;
  transport: VoiceStudioTransportController;
  assetStore: VoiceStudioAssetStore;
  runtime: VoiceStudioRuntime;
};

export type CreateVoiceStudioSessionOptions = {
  project?: VoiceStudioProject;
  historyLimit?: number;
  selection?: VoiceStudioSelectionState;
  transport?: VoiceStudioTransportController;
  assetStore?: VoiceStudioAssetStore;
  runtime?: VoiceStudioRuntime;
  runtimeOptions?: CreateVoiceStudioRuntimeOptions;
};
