import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioAssetStore } from './voice-studio-asset-store';
import { createVoiceStudioEventBus } from './voice-studio-event-bus';
import { createTrackContainer, createVoiceStudioProject } from './voice-studio-project-model';
import { createVoiceStudioRecording } from './voice-studio-recording';
import { createVoiceStudioRuntime } from './voice-studio-runtime';
import { createVoiceStudioTransportController } from './voice-studio-transport-controller';

describe('VoiceStudioRecording', () => {
  it('creates sessions from Transport and publishes RECORD_STARTED', async () => {
    const context = { state: 'suspended', currentTime: 0, destination: {}, resume: vi.fn(async () => { context.state = 'running'; }) };
    const eventBus = createVoiceStudioEventBus();
    const started = vi.fn();
    eventBus.subscribe('RECORD_STARTED', started);
    const runtime = createVoiceStudioRuntime({ audioContextFactory: () => context as unknown as AudioContext });
    const project = createVoiceStudioProject();
    const store = createVoiceStudioAssetStore(runtime, eventBus);
    const transport = createVoiceStudioTransportController({ eventBus, playhead: 5, countInBars: 1, punch: { enabled: true, in: 7, out: 12 } });
    const recording = createVoiceStudioRecording(runtime, project, store, transport, eventBus);

    const session = await recording.begin({ trackId: 'track-a', kind: 'audio', latencyCompensation: 0.045 });
    expect(session).toMatchObject({ trackId: 'track-a', kind: 'audio', start: 7, latencyCompensation: 0.045 });
    expect(transport.getSnapshot().status).toBe('countin');
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(started).toHaveBeenCalledWith({ sessionId: session.id, trackId: 'track-a', start: 7 });
  });

  it('turns audio recording into Asset and publishes project/record stop events', () => {
    const eventBus = createVoiceStudioEventBus();
    const projectChanged = vi.fn();
    const stopped = vi.fn();
    eventBus.subscribe('PROJECT_CHANGED', projectChanged);
    eventBus.subscribe('RECORD_STOPPED', stopped);
    const runtime = createVoiceStudioRuntime({ createObjectURL: () => 'blob:recording', revokeObjectURL: vi.fn() });
    const project = createVoiceStudioProject();
    const track = createTrackContainer({ kind: 'audio', name: 'Voz', index: 0 });
    project.tracks.push(track);
    const store = createVoiceStudioAssetStore(runtime, eventBus);
    const transport = createVoiceStudioTransportController({ eventBus, playhead: 3 });
    const recording = createVoiceStudioRecording(runtime, project, store, transport, eventBus);
    const session = { id: 'session-a', trackId: track.id, kind: 'audio' as const, start: 3, startedAt: 0, latencyCompensation: 0.05, punch: { enabled: false, in: null, out: null } };

    const commit = recording.commitAudio({ blob: new Blob(['audio'], { type: 'audio/webm' }), duration: 2, peaks: [0.2, 0.8], clipName: 'Take 1', session });
    expect(store.getAsset(commit.asset.id)).toBe(commit.asset);
    expect(store.getBlob(commit.asset.id)).toBeInstanceOf(Blob);
    expect(store.getObjectURL(commit.asset.id)).toBe('blob:recording');
    expect(project.assets[commit.asset.id]).toBe(commit.asset);
    expect(project.tracks[0].clips[0]).toMatchObject({ assetId: commit.asset.id, start: 2.95 });
    expect(transport.getSnapshot()).toMatchObject({ status: 'idle', playhead: 4.95 });
    expect(projectChanged).toHaveBeenCalledWith({ project, source: 'recording' });
    expect(stopped).toHaveBeenCalledWith({ sessionId: 'session-a', playhead: 4.95, asset: commit.asset });
  });

  it('turns MIDI recordings into Assets without blobs', () => {
    const eventBus = createVoiceStudioEventBus();
    const runtime = createVoiceStudioRuntime();
    const project = createVoiceStudioProject();
    const track = createTrackContainer({ kind: 'midi', name: 'Teclado', index: 0, instrument: 'piano' });
    project.tracks.push(track);
    const store = createVoiceStudioAssetStore(runtime, eventBus);
    const transport = createVoiceStudioTransportController({ eventBus });
    const recording = createVoiceStudioRecording(runtime, project, store, transport, eventBus);
    const session = { id: 'session-midi', trackId: track.id, kind: 'midi' as const, start: 0, startedAt: 0, latencyCompensation: 0, punch: { enabled: false, in: null, out: null } };
    const commit = recording.commitMidi({
      notes: [{ id: 'n1', note: 60, velocity: 100, start: 0, duration: 1 }], duration: 1, clipName: 'MIDI Take', instrument: 'piano', session,
    });
    expect(commit.asset.kind).toBe('midi');
    expect(store.getAsset(commit.asset.id)).toBe(commit.asset);
    expect(store.getBlob(commit.asset.id)).toBeUndefined();
    expect(project.assets[commit.asset.id]).toBe(commit.asset);
  });
});
