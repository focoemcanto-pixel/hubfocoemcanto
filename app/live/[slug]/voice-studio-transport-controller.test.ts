import { describe, expect, it, vi } from 'vitest';
import type { VoiceStudioPlaybackEngine, VoiceStudioPlaybackSnapshot } from './voice-studio-playback-engine';
import { createVoiceStudioProject } from './voice-studio-project-model';
import { createVoiceStudioTransportController } from './voice-studio-transport-controller';

function playbackMock() {
  return {
    play: vi.fn(async () => undefined),
    pause: vi.fn(() => 4.5),
    stop: vi.fn((reset = false) => reset ? 0 : 6),
  } as unknown as VoiceStudioPlaybackEngine;
}

function playbackSnapshot(): VoiceStudioPlaybackSnapshot {
  return {
    project: createVoiceStudioProject(),
    objectUrls: {},
    offset: 2,
    end: 12,
    mode: 'project',
    loop: false,
  };
}

describe('VoiceStudioTransportController', () => {
  it('owns play, pause, stop and playhead state', async () => {
    const playback = playbackMock();
    const transport = createVoiceStudioTransportController({ playhead: 1, tempo: 120 });
    transport.attachPlayback(playback);

    await transport.play(playbackSnapshot());
    expect(playback.play).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toMatchObject({ status: 'playing', playhead: 2, tempo: 120, bpm: 120 });

    transport.handlePlaybackTick(3.25);
    expect(transport.getSnapshot().playhead).toBe(3.25);

    expect(transport.pause()).toBe(4.5);
    expect(transport.getSnapshot()).toMatchObject({ status: 'idle', playhead: 4.5 });

    expect(transport.stop(true)).toBe(0);
    expect(transport.getSnapshot()).toMatchObject({ status: 'idle', playhead: 0 });
  });

  it('owns seek, loop, punch, count in and BPM', () => {
    const playback = playbackMock();
    const transport = createVoiceStudioTransportController();
    transport.attachPlayback(playback);

    transport.seek(8);
    transport.setLoop({ enabled: true, start: 4, end: 10 });
    transport.setPunch({ enabled: true, in: 5, out: 9 });
    transport.setCountInBars(2);
    transport.beginCountIn();
    transport.setCountBeat(3);
    transport.setBpm(132);

    expect(transport.getSnapshot()).toEqual({
      status: 'countin',
      playhead: 8,
      tempo: 132,
      bpm: 132,
      countInBars: 2,
      countBeat: 3,
      loop: { enabled: true, start: 4, end: 10 },
      punch: { enabled: true, in: 5, out: 9 },
    });
  });

  it('is observable without delegating state ownership to React', () => {
    const transport = createVoiceStudioTransportController();
    const listener = vi.fn();
    const unsubscribe = transport.subscribe(listener);

    transport.seek(7);
    transport.setTempo(100);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    transport.seek(9);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('routes playback end reasons into transport state', () => {
    const transport = createVoiceStudioTransportController();

    transport.beginRecording();
    expect(transport.getSnapshot().status).toBe('recording');
    transport.endRecording(5);
    expect(transport.getSnapshot()).toMatchObject({ status: 'idle', playhead: 5 });

    transport.handlePlaybackEnded(2, 'loop');
    expect(transport.getSnapshot()).toMatchObject({ status: 'playing', playhead: 2 });
    transport.handlePlaybackEnded(0, 'ended');
    expect(transport.getSnapshot()).toMatchObject({ status: 'idle', playhead: 0 });
  });
});
