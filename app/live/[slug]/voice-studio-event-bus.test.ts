import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioEventBus } from './voice-studio-event-bus';

describe('VoiceStudioEventBus', () => {
  it('publishes to subscribers and supports unsubscribe', () => {
    const eventBus = createVoiceStudioEventBus();
    const first = vi.fn();
    const second = vi.fn();
    const release = eventBus.subscribe('PLAYHEAD_CHANGED', first);
    eventBus.subscribe('PLAYHEAD_CHANGED', second);

    eventBus.publish('PLAYHEAD_CHANGED', { playhead: 4.25 });
    expect(first).toHaveBeenCalledWith({ playhead: 4.25 });
    expect(second).toHaveBeenCalledWith({ playhead: 4.25 });

    release();
    eventBus.publish('PLAYHEAD_CHANGED', { playhead: 6 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('awaits asynchronous module handlers when requested', async () => {
    const eventBus = createVoiceStudioEventBus();
    const order: string[] = [];
    eventBus.subscribe('PLAY_STARTED', async () => {
      await Promise.resolve();
      order.push('playback-ready');
    });

    await eventBus.publishAsync('PLAY_STARTED', {
      request: { offset: 0, end: 4, mode: 'project', loop: false },
    });

    expect(order).toEqual(['playback-ready']);
  });

  it('clears all subscriptions', () => {
    const eventBus = createVoiceStudioEventBus();
    const listener = vi.fn();
    eventBus.subscribe('RECORD_STOPPED', listener);
    eventBus.clear();
    eventBus.publish('RECORD_STOPPED', { playhead: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});
