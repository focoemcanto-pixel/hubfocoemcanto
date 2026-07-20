import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioEventBus } from './voice-studio-event-bus';
import type { VoiceStudioPlayback } from './voice-studio-playback';
import type { VoiceStudioRecording } from './voice-studio-recording';
import { createVoiceStudioTransportCommands } from './voice-studio-transport-commands';
import { createVoiceStudioTransportController } from './voice-studio-transport-controller';

const request = { offset: 0, end: 12, mode: 'project' as const, loop: false };

function fixture() {
  const eventBus = createVoiceStudioEventBus();
  const transport = createVoiceStudioTransportController({ eventBus });
  const calls: string[] = [];
  let playing = false;
  const playback = {
    get isPlaying() { return playing; },
    currentTime: vi.fn(() => 4.25),
    pause: vi.fn(() => { calls.push('pause-runtime'); playing = false; eventBus.publish('PLAY_STOPPED', { playhead: 4.25, reason: 'pause' }); return 4.25; }),
    stop: vi.fn(() => { calls.push('stop-runtime'); playing = false; return 4.25; }),
  } as unknown as VoiceStudioPlayback;
  const recording = {
    begin: vi.fn(async () => ({ id: 'recording-session' })),
    cancel: vi.fn(() => { calls.push('cancel-recording'); }),
  } as unknown as VoiceStudioRecording;
  const commands = createVoiceStudioTransportCommands({ transport, playback, recording });
  eventBus.subscribe('PLAY_STARTED', () => { playing = true; calls.push('play-event'); });
  eventBus.subscribe('PLAY_STOPPED', () => calls.push('stop-event'));
  return { commands, transport, playback, recording, calls };
}

describe('VoiceStudioTransportCommands', () => {
  it('uses Space as play from idle and immediate stop from playback', async () => {
    const { commands, transport, playback, calls } = fixture();
    expect(await commands.space(request)).toBe('PLAY');
    expect(transport.state).toBe('PLAYING');

    expect(await commands.space(request)).toBe('STOP');
    expect(playback.stop).toHaveBeenCalledWith(false, 'stop', 4.25, false);
    expect(calls.indexOf('stop-runtime')).toBeLessThan(calls.indexOf('stop-event'));
    expect(transport.state).toBe('IDLE');
  });

  it('keeps Pause distinct from Stop and Return To Start', async () => {
    const { commands, transport, playback } = fixture();
    await commands.play(request);
    expect(commands.pause()).toBe(4.25);
    expect(playback.pause).toHaveBeenCalledTimes(1);
    expect(transport.state).toBe('PAUSED');

    await commands.play({ ...request, offset: 4.25 });
    commands.returnToStart();
    expect(transport.getSnapshot().playhead).toBe(0);
    expect(transport.state).toBe('IDLE');
  });

  it('cancels recording and count-in without waiting for completion', () => {
    const recordingFixture = fixture();
    recordingFixture.transport.beginRecording();
    recordingFixture.commands.stop();
    expect(recordingFixture.recording.cancel).toHaveBeenCalledTimes(1);

    const countInFixture = fixture();
    countInFixture.transport.beginCountIn();
    countInFixture.commands.stop();
    expect(countInFixture.recording.cancel).toHaveBeenCalledTimes(1);
  });

  it('delegates Record without moving recording details into UI commands', async () => {
    const { commands, recording } = fixture();
    const input = { trackId: 'track-a', kind: 'audio' as const, latencyCompensation: 0.03 };
    await expect(commands.record(input)).resolves.toEqual({ id: 'recording-session' });
    expect(recording.begin).toHaveBeenCalledWith(input);
  });

  it('ignores repeated, handled and non-Space keyboard events', async () => {
    const { commands, transport } = fixture();
    const preventDefault = vi.fn();
    const base = { target: null, preventDefault };

    await expect(commands.handleKeyDown({ ...base, code: 'Enter', repeat: false, defaultPrevented: false } as unknown as KeyboardEvent, request)).resolves.toBe('IGNORED');
    await expect(commands.handleKeyDown({ ...base, code: 'Space', repeat: true, defaultPrevented: false } as unknown as KeyboardEvent, request)).resolves.toBe('IGNORED');
    await expect(commands.handleKeyDown({ ...base, code: 'Space', repeat: false, defaultPrevented: true } as unknown as KeyboardEvent, request)).resolves.toBe('IGNORED');
    expect(preventDefault).not.toHaveBeenCalled();
    expect(transport.state).toBe('IDLE');
  });

  it('prevents the browser Space action before dispatching the command', async () => {
    const { commands, transport } = fixture();
    const preventDefault = vi.fn();
    const result = await commands.handleKeyDown({ code: 'Space', repeat: false, defaultPrevented: false, target: null, preventDefault } as unknown as KeyboardEvent, request);
    expect(result).toBe('PLAY');
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(transport.state).toBe('PLAYING');
  });
});
