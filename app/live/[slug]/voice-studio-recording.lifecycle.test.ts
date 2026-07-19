import { afterEach, describe, expect, it, vi } from 'vitest';

import { createVoiceStudioAssetStore } from './voice-studio-asset-store';
import { createVoiceStudioEventBus } from './voice-studio-event-bus';
import { createTrackContainer, createVoiceStudioProject } from './voice-studio-project-model';
import { createVoiceStudioRecording, type VoiceStudioRecordingSession } from './voice-studio-recording';
import { createVoiceStudioRuntime } from './voice-studio-runtime';
import { createVoiceStudioTransportController } from './voice-studio-transport-controller';

function composition() {
  const eventBus = createVoiceStudioEventBus();
  const runtime = createVoiceStudioRuntime({
    audioContextFactory: () => ({ state: 'running', currentTime: 0, destination: {}, resume: vi.fn(async () => undefined) }) as unknown as AudioContext,
    createObjectURL: () => 'blob:test',
    revokeObjectURL: vi.fn(),
  });
  const project = createVoiceStudioProject();
  const store = createVoiceStudioAssetStore(runtime, eventBus);
  const transport = createVoiceStudioTransportController({ eventBus, playhead: 2 });
  return { eventBus, runtime, project, store, transport };
}

function session(trackId: string, kind: 'audio' | 'midi' = 'audio'): VoiceStudioRecordingSession {
  return {
    id: 'recording-session', trackId, kind, start: 2, startedAt: 0, latencyCompensation: 0,
    punch: { enabled: false, in: null, out: null },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('VoiceStudioRecording lifecycle', () => {
  it('moves from count-in to recording and supports cancellation', () => {
    const { eventBus, runtime, project, store, transport } = composition();
    const stopped = vi.fn();
    eventBus.subscribe('RECORD_STOPPED', stopped);
    const recording = createVoiceStudioRecording(runtime, project, store, transport, eventBus);

    transport.beginCountIn();
    recording.startAfterCountIn();
    expect(transport.getSnapshot().status).toBe('recording');

    recording.cancel(6);
    expect(transport.getSnapshot()).toMatchObject({ status: 'idle', playhead: 6 });
    expect(stopped).toHaveBeenCalledWith({ playhead: 6 });
  });

  it('removes a registered asset when the armed track cannot accept the commit', () => {
    const { eventBus, runtime, project, store, transport } = composition();
    const recording = createVoiceStudioRecording(runtime, project, store, transport, eventBus);
    const remove = vi.spyOn(store, 'remove');

    expect(() => recording.commitAudio({
      blob: new Blob(['audio'], { type: 'audio/webm' }), duration: 1, peaks: [], clipName: 'Invalid', session: session('missing-track'),
    })).toThrow('A gravação não pôde ser inserida na track armada.');
    expect(remove).toHaveBeenCalledOnce();
    expect(store.size).toBe(0);
  });

  it('clamps very short recordings to the minimum duration', () => {
    const { eventBus, runtime, project, store, transport } = composition();
    const track = createTrackContainer({ kind: 'midi', name: 'Keys', instrument: 'piano' });
    project.tracks.push(track);
    const recording = createVoiceStudioRecording(runtime, project, store, transport, eventBus);

    const committed = recording.commitMidi({ notes: [], duration: 0, clipName: 'Short', session: session(track.id, 'midi') });
    expect(committed.asset.duration).toBe(0.08);
    expect(project.tracks[0].clips[0].duration).toBe(0.08);
  });

  it('fails clearly when MediaRecorder is unavailable', () => {
    const { eventBus, runtime, project, store, transport } = composition();
    vi.stubGlobal('MediaRecorder', undefined);
    const recording = createVoiceStudioRecording(runtime, project, store, transport, eventBus);

    expect(recording.supportedMimeType()).toBe('');
    expect(() => recording.createAudioCapture({} as MediaStream)).toThrow('Este navegador não oferece MediaRecorder.');
  });
});
