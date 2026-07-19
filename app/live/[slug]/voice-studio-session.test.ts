import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioAssetStore, VoiceStudioAssetStore } from './voice-studio-asset-store';
import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import { VoiceStudioPlaybackEngine } from './voice-studio-playback-engine';
import { createVoiceStudioProject } from './voice-studio-project-model';
import { createVoiceStudioRuntime } from './voice-studio-runtime';
import { createSelectionState } from './voice-studio-selection-engine';
import { createVoiceStudioSession } from './voice-studio-session';
import { createVoiceStudioTransportController, VoiceStudioTransportController } from './voice-studio-transport-controller';

function playbackCallbacks() {
  return {
    midiFrequency: vi.fn(() => 440),
    instrumentWave: vi.fn(() => 'sine' as OscillatorType),
  };
}

describe('createVoiceStudioSession', () => {
  it('composes the existing Voice Studio modules without starting browser runtime', () => {
    const audioContextFactory = vi.fn(() => {
      throw new Error('AudioContext should not be requested during composition.');
    });
    const session = createVoiceStudioSession({
      playbackCallbacks: playbackCallbacks(),
      runtimeOptions: { audioContextFactory },
    });

    expect(session.project.schemaVersion).toBe(2);
    expect(session.history).toBeInstanceOf(VoiceStudioHistoryEngine);
    expect(session.selection.clipIds.size).toBe(0);
    expect(session.playback).toBeInstanceOf(VoiceStudioPlaybackEngine);
    expect(session.recording.createRecordingSession).toBeTypeOf('function');
    expect(session.transport).toBeInstanceOf(VoiceStudioTransportController);
    expect(session.transport.getSnapshot()).toMatchObject({ status: 'idle', playhead: 0, tempo: 90, bpm: 90 });
    expect(session.assetStore).toBeInstanceOf(VoiceStudioAssetStore);
    expect(session.assetStore.size).toBe(0);
    expect(session.runtime.initialized).toBe(false);
    expect(session.runtime.disposed).toBe(false);
    expect(audioContextFactory).not.toHaveBeenCalled();
  });

  it('preserves explicitly supplied composition objects', () => {
    const project = createVoiceStudioProject('Session project');
    project.view.playhead = 12;
    const selection = createSelectionState(['clip-a']);
    const transport = createVoiceStudioTransportController({ playhead: 7, tempo: 120 });
    const runtime = createVoiceStudioRuntime({
      audioContextFactory: () => {
        throw new Error('AudioContext should remain lazy.');
      },
    });
    const assetStore = createVoiceStudioAssetStore(runtime);

    const session = createVoiceStudioSession({
      playbackCallbacks: playbackCallbacks(),
      project,
      selection,
      transport,
      assetStore,
      runtime,
      historyLimit: 12,
    });

    expect(session.project).toBe(project);
    expect(session.selection).toBe(selection);
    expect(session.transport).toBe(transport);
    expect(session.assetStore).toBe(assetStore);
    expect(session.runtime).toBe(runtime);
    expect(session.history.limit).toBe(12);
  });
});
