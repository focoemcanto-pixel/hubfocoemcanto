import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createVoiceStudioAssetStore } from './voice-studio-asset-store';
import { createVoiceStudioEventBus } from './voice-studio-event-bus';
import { createVoiceStudioPlayback, playbackSelectionRange } from './voice-studio-playback';
import {
  addAssetClipToProject,
  createTrackContainer,
  createVoiceStudioProject,
  type VoiceStudioAsset,
} from './voice-studio-project-model';
import { createVoiceStudioRuntime } from './voice-studio-runtime';

function projectWithTwoClips() {
  const track = createTrackContainer({ kind: 'audio', name: 'Lead' });
  const first: VoiceStudioAsset = { id: 'a1', kind: 'audio', duration: 3, createdAt: '', peaks: [], midiNotes: [] };
  const second: VoiceStudioAsset = { id: 'a2', kind: 'audio', duration: 2, createdAt: '', peaks: [], midiNotes: [] };
  let project = { ...createVoiceStudioProject(), tracks: [track] };
  project = addAssetClipToProject(project, first, 'First', 1, track.id);
  project = addAssetClipToProject(project, second, 'Second', 7, track.id);
  return { project, clipIds: project.tracks[0].clips.map(clip => clip.id) };
}

beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VoiceStudioPlayback', () => {
  it('derives the selected playback range from clip geometry', () => {
    const { project, clipIds } = projectWithTwoClips();

    expect(playbackSelectionRange(project, clipIds)).toEqual({ start: 1, end: 9 });
    expect(playbackSelectionRange(project, [])).toBeNull();
  });

  it('starts, reports current time and stops through its public lifecycle', async () => {
    const context = {
      currentTime: 10,
      state: 'suspended' as AudioContextState,
      destination: {} as AudioDestinationNode,
      resume: vi.fn(async () => { context.state = 'running'; }),
      close: vi.fn(async () => { context.state = 'closed'; }),
    };
    const eventBus = createVoiceStudioEventBus();
    const stopped = vi.fn();
    eventBus.subscribe('PLAY_STOPPED', stopped);
    const runtime = createVoiceStudioRuntime({ audioContextFactory: () => context as unknown as AudioContext });
    const project = createVoiceStudioProject();
    const store = createVoiceStudioAssetStore(runtime, eventBus);
    const playback = createVoiceStudioPlayback({ runtime, eventBus, project, assetStore: store });

    await playback.play({ offset: 2, end: 12, mode: 'project', loop: false });
    expect(context.resume).toHaveBeenCalledOnce();
    expect(playback.isPlaying).toBe(true);

    context.currentTime = 11;
    expect(playback.currentTime()).toBeCloseTo(2.955, 3);

    const playhead = playback.pause();
    expect(playhead).toBeCloseTo(2.955, 3);
    expect(playback.isPlaying).toBe(false);
    expect(stopped).toHaveBeenCalledWith({ playhead, reason: 'pause' });

    playback.dispose();
  });

  it('reacts to PLAY_STARTED and PROJECT_CHANGED events without direct module calls', async () => {
    const context = {
      currentTime: 0,
      state: 'running' as AudioContextState,
      destination: {} as AudioDestinationNode,
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const eventBus = createVoiceStudioEventBus();
    const runtime = createVoiceStudioRuntime({ audioContextFactory: () => context as unknown as AudioContext });
    const store = createVoiceStudioAssetStore(runtime, eventBus);
    const playback = createVoiceStudioPlayback({ runtime, eventBus, project: createVoiceStudioProject(), assetStore: store });

    eventBus.publish('PROJECT_CHANGED', { project: createVoiceStudioProject('Changed'), source: 'test' });
    eventBus.publish('PLAY_STARTED', { request: { offset: 0, end: 4, mode: 'project', loop: false } });
    await Promise.resolve();

    expect(playback.isPlaying).toBe(true);
    eventBus.publish('PLAY_STOPPED', { playhead: 1.5, reason: 'stop' });
    expect(playback.isPlaying).toBe(false);
    playback.dispose();
  });
});
