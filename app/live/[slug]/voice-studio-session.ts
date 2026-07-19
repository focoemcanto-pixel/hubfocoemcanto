import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import { VoiceStudioPlaybackEngine } from './voice-studio-playback-engine';
import { createVoiceStudioProject } from './voice-studio-project-model';
import {
  buildRecordedAudioAsset,
  commitRecordingToProject,
  createAudioCapture,
  createRecordingSession,
  supportedRecordingMimeType,
} from './voice-studio-recording-engine';
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

  return {
    project,
    history: new VoiceStudioHistoryEngine(options.historyLimit),
    selection: options.selection ?? createSelectionState(),
    playback: new VoiceStudioPlaybackEngine(options.playbackCallbacks),
    recording,
    transport: options.transport ?? {
      status: 'idle',
      position: project.view.playhead,
    },
    assetStore: options.assetStore ?? {
      blobs: new Map(),
      objectUrls: new Map(),
    },
    runtime: options.runtime ?? {
      audioContext: null,
      disposed: false,
    },
  };
}
