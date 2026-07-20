import { createVoiceStudioAssetStore } from './voice-studio-asset-store';
import { createVoiceStudioEventBus } from './voice-studio-event-bus';
import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import { createVoiceStudioPlayback } from './voice-studio-playback';
import { createVoiceStudioProjectActions } from './voice-studio-project-actions';
import { createVoiceStudioProject } from './voice-studio-project-model';
import { createVoiceStudioRecording } from './voice-studio-recording';
import { createVoiceStudioRuntime } from './voice-studio-runtime';
import { createSelectionState } from './voice-studio-selection-engine';
import { createVoiceStudioTransportCommands } from './voice-studio-transport-commands';
import { createVoiceStudioTransportController } from './voice-studio-transport-controller';
import type { CreateVoiceStudioSessionOptions, VoiceStudioSession } from './voice-studio-session-types';

export function createVoiceStudioSession(options: CreateVoiceStudioSessionOptions = {}): VoiceStudioSession {
  const project = options.project ?? createVoiceStudioProject();
  const eventBus = options.eventBus ?? createVoiceStudioEventBus();
  const history = new VoiceStudioHistoryEngine(options.historyLimit);
  const actions = createVoiceStudioProjectActions(project, history, eventBus);
  const runtime = options.runtime ?? createVoiceStudioRuntime(options.runtimeOptions);
  const assetStore = options.assetStore ?? createVoiceStudioAssetStore(runtime, eventBus);
  const transport = options.transport ?? createVoiceStudioTransportController({
    eventBus,
    playhead: project.view.playhead,
    tempo: project.tempo,
    countInBars: project.countInBars,
    loop: project.loop,
  });
  const playback = createVoiceStudioPlayback({ runtime, eventBus, project, assetStore });
  const recording = createVoiceStudioRecording(runtime, project, assetStore, transport, eventBus);
  const transportCommands = createVoiceStudioTransportCommands({ transport, playback, recording });

  return {
    project,
    actions,
    eventBus,
    history,
    selection: options.selection ?? createSelectionState(),
    playback,
    recording,
    transport,
    transportCommands,
    assetStore,
    runtime,
  };
}
