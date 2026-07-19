import type { VoiceStudioAssetStore } from './voice-studio-asset-store';
import type { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import type { VoiceStudioPlayback } from './voice-studio-playback';
import type { VoiceStudioProjectActions } from './voice-studio-project-actions';
import type { VoiceStudioProject } from './voice-studio-project-model';
import type { VoiceStudioRecording } from './voice-studio-recording';
import type { VoiceStudioRuntime, CreateVoiceStudioRuntimeOptions } from './voice-studio-runtime';
import type { VoiceStudioSelectionState } from './voice-studio-selection-engine';
import type { VoiceStudioTransportController } from './voice-studio-transport-controller';

export type VoiceStudioSession = {
  project: VoiceStudioProject;
  actions: VoiceStudioProjectActions;
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
