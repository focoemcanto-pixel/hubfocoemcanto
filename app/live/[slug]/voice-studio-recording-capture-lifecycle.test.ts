import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioRecordingCaptureLifecycle } from './voice-studio-recording-capture-lifecycle';

describe('VoiceStudioRecordingCaptureLifecycle', () => {
  it('starts and stops one capture', async () => {
    const lifecycle = createVoiceStudioRecordingCaptureLifecycle();
    const stop = vi.fn();
    const dispose = vi.fn();

    await expect(lifecycle.start('audio', async () => ({ stop, cancel: vi.fn(), dispose }))).resolves.toBe(true);
    expect(lifecycle.getSnapshot().state).toBe('capturing');

    await lifecycle.stop();
    expect(stop).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(lifecycle.getSnapshot().state).toBe('idle');
  });

  it('cancels and disposes an active capture', async () => {
    const lifecycle = createVoiceStudioRecordingCaptureLifecycle();
    const cancel = vi.fn();
    const dispose = vi.fn();
    await lifecycle.start('midi', async () => ({ stop: vi.fn(), cancel, dispose }));

    await lifecycle.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(lifecycle.getSnapshot()).toMatchObject({ state: 'idle', kind: null });
  });

  it('rejects overlapping starts', async () => {
    const lifecycle = createVoiceStudioRecordingCaptureLifecycle();
    await lifecycle.start('audio', async () => ({ stop: vi.fn(), cancel: vi.fn() }));
    await expect(lifecycle.start('midi', async () => ({ stop: vi.fn(), cancel: vi.fn() }))).resolves.toBe(false);
  });

  it('exposes preparation failures without leaking a handle', async () => {
    const lifecycle = createVoiceStudioRecordingCaptureLifecycle();
    await expect(lifecycle.start('audio', async () => { throw new Error('Microfone bloqueado'); })).resolves.toBe(false);
    expect(lifecycle.getSnapshot()).toMatchObject({ state: 'failed', error: 'Microfone bloqueado' });
  });

  it('disposes a late handle after cancellation during preparation', async () => {
    const lifecycle = createVoiceStudioRecordingCaptureLifecycle();
    const dispose = vi.fn();
    let resolve!: (value: { stop: () => void; cancel: () => void; dispose: () => void }) => void;
    const pending = new Promise<{ stop: () => void; cancel: () => void; dispose: () => void }>(next => { resolve = next; });

    const start = lifecycle.start('audio', () => pending);
    await lifecycle.cancel();
    resolve({ stop: vi.fn(), cancel: vi.fn(), dispose });

    await expect(start).resolves.toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(lifecycle.getSnapshot().state).toBe('idle');
  });
});
