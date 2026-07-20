import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioTransportStateMachine } from './voice-studio-transport-state-machine';

describe('VoiceStudioTransportStateMachine', () => {
  it('runs explicit playback transitions', () => {
    const machine = createVoiceStudioTransportStateMachine();
    expect(machine.transition('PLAY')).toEqual({ from: 'IDLE', event: 'PLAY', to: 'PLAYING' });
    expect(machine.transition('PAUSE')).toEqual({ from: 'PLAYING', event: 'PAUSE', to: 'PAUSED' });
    expect(machine.transition('PLAY')).toEqual({ from: 'PAUSED', event: 'PLAY', to: 'PLAYING' });
    expect(machine.transition('STOP')).toEqual({ from: 'PLAYING', event: 'STOP', to: 'STOPPING' });
    expect(machine.transition('STOPPED')).toEqual({ from: 'STOPPING', event: 'STOPPED', to: 'IDLE' });
  });

  it('gives STOP an explicit path from active states', () => {
    for (const state of ['PLAYING', 'PAUSED', 'RECORDING', 'COUNT_IN', 'SEEKING'] as const) {
      const machine = createVoiceStudioTransportStateMachine(state);
      expect(machine.transition('STOP')?.to).toBe('STOPPING');
      expect(machine.transition('STOPPED')?.to).toBe('IDLE');
    }
  });

  it('returns to the prior stable state after seeking', () => {
    const playing = createVoiceStudioTransportStateMachine('PLAYING');
    playing.transition('SEEK');
    expect(playing.state).toBe('SEEKING');
    expect(playing.transition('SEEK_FINISHED')?.to).toBe('PLAYING');

    const idle = createVoiceStudioTransportStateMachine();
    idle.transition('SEEK');
    expect(idle.transition('SEEK_FINISHED')?.to).toBe('IDLE');
  });

  it('rejects invalid transitions without changing state', () => {
    const machine = createVoiceStudioTransportStateMachine();
    expect(machine.transition('PAUSE')).toBeNull();
    expect(machine.state).toBe('IDLE');
  });

  it('notifies observers only for accepted transitions', () => {
    const machine = createVoiceStudioTransportStateMachine();
    const listener = vi.fn();
    const release = machine.subscribe(listener);
    machine.transition('PAUSE');
    machine.transition('PLAY');
    expect(listener).toHaveBeenCalledTimes(1);
    release();
    machine.transition('STOP');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
