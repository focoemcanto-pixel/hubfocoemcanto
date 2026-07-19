import { describe, expect, it, vi } from 'vitest';
import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import { VoiceStudioPlaybackEngine } from './voice-studio-playback-engine';
import { createVoiceStudioProject } from './voice-studio-project-model';
import { createSelectionState } from './voice-studio-selection-engine';
import { createVoiceStudioSession } from './voice-studio-session';

function playbackCallbacks() {
  return {
    getAudioContext: vi.fn(() => {
      throw new Error('AudioContext should not be requested during composition.');
    }),
    onTick: vi.fn(),
    onEnded: vi.fn(),
    midiFrequency: vi.fn(() => 440),
    instrumentWave: vi.fn(() => 'sine' as OscillatorType),
  };
}

describe('createVoiceStudioSession', () => {
  it('composes the existing Voice Studio modules without starting browser runtime', () => {
    const callbacks = playbackCallbacks();
    const session = createVoiceStudioSession({ playbackCallbacks: callbacks });

    expect(session.project.schemaVersion).toBe(2);
    expect(session.history).toBeInstanceOf(VoiceStudioHistoryEngine);
    expect(session.selection.clipIds.size).toBe(0);
    expect(session.playback).toBeInstanceOf(VoiceStudioPlaybackEngine);
    expect(session.recording.createRecordingSession).toBeTypeOf('function');
    expect(session.transport).toEqual({ status: 'idle', position: 0 });
    expect(session.assetStore.blobs.size).toBe(0);
    expect(session.assetStore.objectUrls.size).toBe(0);
    expect(session.runtime).toEqual({ audioContext: null, disposed: false });
    expect(callbacks.getAudioContext).not.toHaveBeenCalled();
  });

  it('preserves explicitly supplied composition objects', () => {
    const project = createVoiceStudioProject('Session project');
    project.view.playhead = 12;
    const selection = createSelectionState(['clip-a']);
    const transport = { status: 'playing' as const, position: 7 };
    const assetStore = { blobs: new Map<string, Blob>(), objectUrls: new Map<string, string>() };
    const runtime = { audioContext: null, disposed: true };

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
