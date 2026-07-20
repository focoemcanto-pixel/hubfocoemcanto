import { describe, expect, it } from 'vitest';
import type { VoiceStudioTransportSnapshot } from './voice-studio-transport-controller';
import { createVoiceStudioTransportViewModel } from './voice-studio-transport-view-model';

function snapshot(
  state: VoiceStudioTransportSnapshot['state'],
  playhead = 0,
): VoiceStudioTransportSnapshot {
  return {
    state,
    status: state === 'PLAYING' ? 'playing' : state === 'RECORDING' ? 'recording' : state === 'COUNT_IN' ? 'countin' : 'idle',
    playhead,
    tempo: 120,
    bpm: 120,
    countInBars: 0,
    countBeat: 0,
    loop: { enabled: false, start: 0, end: 0 },
    punch: { enabled: false, in: null, out: null },
  };
}

describe('createVoiceStudioTransportViewModel', () => {
  it('permite play e record somente em IDLE', () => {
    const view = createVoiceStudioTransportViewModel(snapshot('IDLE'));
    expect(view).toMatchObject({
      isIdle: true,
      canPlay: true,
      canPause: false,
      canStop: false,
      canRecord: true,
    });
  });

  it('separa pause de stop durante playback', () => {
    const view = createVoiceStudioTransportViewModel(snapshot('PLAYING', 4.2));
    expect(view).toMatchObject({
      isPlaying: true,
      canPlay: false,
      canPause: true,
      canStop: true,
      canRecord: false,
      canReturnToStart: true,
    });
  });

  it('permite retomar a partir de PAUSED', () => {
    const view = createVoiceStudioTransportViewModel(snapshot('PAUSED', 8));
    expect(view).toMatchObject({
      isPaused: true,
      canPlay: true,
      canPause: false,
      canStop: true,
    });
  });

  it.each(['RECORDING', 'COUNT_IN', 'STOPPING', 'SEEKING'] as const)(
    'mantém STOP disponível em %s',
    state => {
      const view = createVoiceStudioTransportViewModel(snapshot(state));
      expect(view.canStop).toBe(true);
      expect(view.canPlay).toBe(false);
      expect(view.canRecord).toBe(false);
    },
  );

  it('habilita Return To Start quando o playhead não está em zero', () => {
    expect(createVoiceStudioTransportViewModel(snapshot('IDLE', 0)).canReturnToStart).toBe(false);
    expect(createVoiceStudioTransportViewModel(snapshot('IDLE', 0.01)).canReturnToStart).toBe(true);
  });
});
