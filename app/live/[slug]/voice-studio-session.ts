import { createVoiceStudioAssetStore } from './voice-studio-asset-store';
import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import { createVoiceStudioPlayback } from './voice-studio-playback';
import { createVoiceStudioProject } from './voice-studio-project-model';
import { createVoiceStudioRecording } from './voice-studio-recording';
import { createVoiceStudioRuntime } from './voice-studio-runtime';
import { createSelectionState } from './voice-studio-selection-engine';
import { createVoiceStudioTransportController } from './voice-studio-transport-controller';
import type { CreateVoiceStudioSessionOptions, VoiceStudioSession } from './voice-studio-session-types';

export function createVoiceStudioSession(options: CreateVoiceStudioSessionOptions = {}): VoiceStudioSession {
  const project = options.project ?? createVoiceStudioProject();
  const runtime = options.runtime ?? createVoiceStudioRuntime(options.runtimeOptions);
  const assetStore = options.assetStore ?? createVoiceStudioAssetStore(runtime);
  const transport = options.transport ?? createVoiceStudioTransportController({
    playhead: project.view.playhead,
    tempo: project.tempo,
    countInBars: project.countInBars,
    loop: project.loop,
  });
  const playback = createVoiceStudioPlayback({ runtime, transport, project, assetStore });
  const recording = createVoiceStudioRecording(runtime, project, assetStore, transport);
  transport.attachPlayback(playback);

  return {
    project,
    history: new VoiceStudioHistoryEngine(options.historyLimit),
    selection: options.selection ?? createSelectionState(),
    playback,
    recording,
    transport,
    assetStore,
    runtime,
  };
}
