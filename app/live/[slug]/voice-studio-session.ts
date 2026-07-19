import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import { createVoiceStudioProject } from './voice-studio-project-model';
import {
  buildRecordedAudioAsset,
  commitRecordingToProject,
  createAudioCapture,
  createRecordingSession,
  supportedRecordingMimeType,
} from './voice-studio-recording-engine';
import { createVoiceStudioRuntime } from './voice-studio-runtime';
import { createSelectionState } from './voice-studio-selection-engine';
import type {
  CreateVoiceStudioSessionOptions,
  VoiceStudioRecording,
  VoiceStudioSession,
} from './voice-studio-session-types';

const recording: VoiceStudioRecording = {
  supportedRecordingMimeType,
  createRecordingSession,
  createAudioCapture,
  buildRecordedAudioAsset,
  commitRecordingToProject,
};

export function createVoiceStudioSession(options: CreateVoiceStudioSessionOptions): VoiceStudioSession {
  const project = options.project ?? createVoiceStudioProject();
  const runtime = options.runtime ?? createVoiceStudioRuntime(options.runtimeOptions);

  return {
    project,
    history: new VoiceStudioHistoryEngine(options.historyLimit),
    selection: options.selection ?? createSelectionState(),
    playback: runtime.createPlayback(options.playbackCallbacks),
    recording,
    transport: options.transport ?? {
      status: 'idle',
      position: project.view.playhead,
    },
    assetStore: options.assetStore ?? {
      blobs: new Map(),
    },
    runtime,
  };
}
