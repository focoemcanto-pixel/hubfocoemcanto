import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioEventBus } from './voice-studio-event-bus';
import type { VoiceStudioPlaybackRequest } from './voice-studio-playback';
import { createVoiceStudioTransportController } from './voice-studio-transport-controller';

function playbackRequest(): VoiceStudioPlaybackRequest {
  return { offset: 2, end: 12, mode: 'project', loop: false };
}

describe('VoiceStudioTransportController', () => {
  it('publishes playback intent and derives state from EventBus events', async () => {
    const eventBus = createVoiceStudioEventBus();
    const started = vi.fn();
    eventBus.subscribe('PLAY_STARTED', started);
    const transport = createVoiceStudioTransportController({ eventBus, playhead: 1, tempo: 120 });

    await transport.play(playbackRequest());
    expect(started).toHaveBeenCalledWith({ request: playbackRequest() });
    expect(transport.getSnapshot()).toMatchObject({ state: 'PLAYING', status: 'playing', playhead: 2, tempo: 120, bpm: 120 });

    eventBus.publish('PLAYHEAD_CHANGED', { playhead: 3.25 });
    expect(transport.getSnapshot().playhead).toBe(3.25);
    eventBus.publish('PLAY_STOPPED', { playhead: 4.5, reason: 'pause' });
    expect(transport.getSnapshot()).toMatchObject({ state: 'PAUSED', status: 'idle', playhead: 4.5 });
  });

  it('owns seek, loop, punch, count in and BPM', () => {
    const eventBus = createVoiceStudioEventBus();
    const transport = createVoiceStudioTransportController({ eventBus });
    transport.seek(8);
    transport.setLoop({ enabled: true, start: 4, end: 10 });
    transport.setPunch({ enabled: true, in: 5, out: 9 });
    transport.setCountInBars(2);
    transport.beginCountIn();
    transport.setCountBeat(3);
    transport.setBpm(132);
    expect(transport.getSnapshot()).toEqual({
      state: 'COUNT_IN', status: 'countin', playhead: 8, tempo: 132, bpm: 132, countInBars: 2, countBeat: 3,
      loop: { enabled: true, start: 4, end: 10 }, punch: { enabled: true, in: 5, out: 9 },
    });
  });

  it('is observable without delegating ownership to React', () => {
    const eventBus = createVoiceStudioEventBus();
    const transport = createVoiceStudioTransportController({ eventBus });
    const listener = vi.fn();
    const unsubscribe = transport.subscribe(listener);
    transport.seek(7);
    transport.setTempo(100);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    transport.seek(9);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('routes playback end reasons received from EventBus into state', () => {
    const eventBus = createVoiceStudioEventBus();
    const transport = createVoiceStudioTransportController({ eventBus });
    transport.beginRecording();
    transport.endRecording(5);
    expect(transport.getSnapshot()).toMatchObject({ state: 'IDLE', status: 'idle', playhead: 5 });
    eventBus.publish('PLAY_STOPPED', { playhead: 2, reason: 'loop' });
    expect(transport.getSnapshot()).toMatchObject({ state: 'PLAYING', status: 'playing', playhead: 2 });
    eventBus.publish('PLAY_STOPPED', { playhead: 0, reason: 'ended' });
    expect(transport.getSnapshot()).toMatchObject({ state: 'IDLE', status: 'idle', playhead: 0 });
  });

  it('separates pause, stop and return to start', async () => {
    const eventBus = createVoiceStudioEventBus();
    const transport = createVoiceStudioTransportController({ eventBus, playhead: 3 });
    await transport.play(playbackRequest());
    expect(transport.pause()).toBe(2);
    expect(transport.state).toBe('PAUSED');
    expect(transport.stop()).toBe(2);
    expect(transport.state).toBe('IDLE');
    expect(transport.returnToStart()).toBe(0);
    expect(transport.getSnapshot().playhead).toBe(0);
  });
});
