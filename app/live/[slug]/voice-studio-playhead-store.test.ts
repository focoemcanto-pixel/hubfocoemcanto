import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioEventBus } from './voice-studio-event-bus';
import { createVoiceStudioPlayheadStore } from './voice-studio-playhead-store';
import { createVoiceStudioProject } from './voice-studio-project-model';

const playbackRequest = { offset: 0, end: 10, mode: 'project' as const, loop: false };

describe('VoiceStudioPlayheadStore', () => {
  it('starts from the supplied playhead', () => {
    const store = createVoiceStudioPlayheadStore(createVoiceStudioEventBus(), 3.5);
    expect(store.getSnapshot()).toEqual({ playhead: 3.5, revision: 0 });
  });

  it('observes PLAYHEAD_CHANGED and deduplicates equal values', () => {
    const bus = createVoiceStudioEventBus();
    const store = createVoiceStudioPlayheadStore(bus);
    const listener = vi.fn();
    store.subscribe(listener);

    bus.publish('PLAYHEAD_CHANGED', { playhead: 2 });
    bus.publish('PLAYHEAD_CHANGED', { playhead: 2 });

    expect(store.getSnapshot()).toEqual({ playhead: 2, revision: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('uses the final playhead from stop and recording events', () => {
    const bus = createVoiceStudioEventBus();
    const store = createVoiceStudioPlayheadStore(bus);

    bus.publish('PLAY_STARTED', { request: playbackRequest });
    bus.publish('PLAY_STOPPED', { playhead: 4.25, reason: 'stop' });
    expect(store.getSnapshot().playhead).toBe(4.25);

    bus.publish('RECORD_STOPPED', { sessionId: 'recording', playhead: 8 });
    expect(store.getSnapshot().playhead).toBe(8);
  });

  it('resets from the project snapshot when the project changes', () => {
    const bus = createVoiceStudioEventBus();
    const store = createVoiceStudioPlayheadStore(bus, 6);
    const project = createVoiceStudioProject();
    project.view.playhead = 1.5;

    bus.publish('PROJECT_CHANGED', { project, source: 'actions' });

    expect(store.getSnapshot().playhead).toBe(1.5);
  });

  it('normalizes invalid and negative playheads', () => {
    const bus = createVoiceStudioEventBus();
    const store = createVoiceStudioPlayheadStore(bus, -5);
    expect(store.getSnapshot().playhead).toBe(0);

    bus.publish('PLAYHEAD_CHANGED', { playhead: Number.NaN });
    expect(store.getSnapshot().playhead).toBe(0);
  });

  it('stops observing after dispose', () => {
    const bus = createVoiceStudioEventBus();
    const store = createVoiceStudioPlayheadStore(bus);
    store.dispose();

    bus.publish('PLAYHEAD_CHANGED', { playhead: 9 });

    expect(store.getSnapshot().playhead).toBe(0);
  });
});
