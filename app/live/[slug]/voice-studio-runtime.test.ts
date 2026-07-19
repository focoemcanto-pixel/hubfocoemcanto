import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioRuntime } from './voice-studio-runtime';

function fakeAudioContext() {
  const context = {
    currentTime: 0,
    destination: {} as AudioDestinationNode,
    state: 'suspended' as AudioContextState,
    resume: vi.fn(async () => { context.state = 'running'; }),
    suspend: vi.fn(async () => { context.state = 'suspended'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
  };
  return context;
}

describe('VoiceStudioRuntime', () => {
  it('owns AudioContext lazily', async () => {
    const context = fakeAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const runtime = createVoiceStudioRuntime({ audioContextFactory: factory });

    expect(runtime.initialized).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    await runtime.resume();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(runtime.initialized).toBe(true);
    expect(runtime.destination).toBe(context.destination);
  });

  it('owns object URLs, decoded audio and waveform caches', () => {
    const revoked: string[] = [];
    const runtime = createVoiceStudioRuntime({
      createObjectURL: () => 'blob:asset-a',
      revokeObjectURL: url => revoked.push(url),
    });
    const audioBuffer = {} as AudioBuffer;
    const waveform = [0.1, 0.8, 0.3] as const;

    runtime.registerObjectURL('asset-a', new Blob(['audio']));
    runtime.cacheDecodedAudio('asset-a', audioBuffer);
    runtime.cacheWaveform('asset-a', waveform);

    expect(runtime.objectURLSnapshot()).toEqual({ 'asset-a': 'blob:asset-a' });
    expect(runtime.getDecodedAudio('asset-a')).toBe(audioBuffer);
    expect(runtime.getWaveform('asset-a')).toBe(waveform);
    expect(runtime.revokeObjectURL('asset-a')).toBe(true);
    expect(revoked).toEqual(['blob:asset-a']);
  });

  it('provides an inactive scheduler and playback clock', () => {
    const scheduled = new Map<number, () => void>();
    let nextHandle = 1;
    const runtime = createVoiceStudioRuntime({
      setTimeout: task => {
        const handle = nextHandle++;
        scheduled.set(handle, task);
        return handle as unknown as ReturnType<typeof globalThis.setTimeout>;
      },
      clearTimeout: handle => scheduled.delete(handle as unknown as number),
    });
    const task = vi.fn();

    expect(runtime.scheduler.size).toBe(0);
    expect(runtime.playbackClock.running).toBe(false);
    const id = runtime.scheduler.schedule(25, task);
    expect(runtime.scheduler.cancel(id)).toBe(true);
    expect(task).not.toHaveBeenCalled();
    runtime.playbackClock.start(3);
    expect(runtime.playbackClock.position).toBe(3);
    expect(runtime.playbackClock.stop()).toBe(3);
  });

  it('disposes resources owned by the runtime', async () => {
    const context = fakeAudioContext();
    const revokeObjectURL = vi.fn();
    const runtime = createVoiceStudioRuntime({
      audioContextFactory: () => context as unknown as AudioContext,
      createObjectURL: () => 'blob:asset-a',
      revokeObjectURL,
    });

    runtime.registerObjectURL('asset-a', new Blob(['audio']));
    runtime.cacheDecodedAudio('asset-a', {} as AudioBuffer);
    runtime.cacheWaveform('asset-a', [0.5]);
    void runtime.destination;
    await runtime.dispose();

    expect(runtime.disposed).toBe(true);
    expect(runtime.initialized).toBe(false);
    expect(runtime.getObjectURL('asset-a')).toBeUndefined();
    expect(runtime.getDecodedAudio('asset-a')).toBeUndefined();
    expect(runtime.getWaveform('asset-a')).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:asset-a');
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
