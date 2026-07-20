import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'app/live/[slug]/voice-studio-legacy-audio-capture-facade.ts'),
  'utf8',
);

describe('voice studio legacy audio capture facade', () => {
  it('composes the browser audio input session', () => {
    expect(source).toContain('createVoiceStudioBrowserAudioInputSession');
  });

  it('preserves legacy microphone preferences without owning browser APIs directly', () => {
    expect(source).toContain('deviceId: options.deviceId ? { exact: options.deviceId } : undefined');
    expect(source).toContain('echoCancellation: false');
    expect(source).not.toContain('navigator.mediaDevices.getUserMedia');
    expect(source).not.toContain('new MediaRecorder');
  });

  it('exposes recorder, stream and lifecycle methods needed by the legacy controller', () => {
    expect(source).toContain('readonly recorder: MediaRecorder');
    expect(source).toContain('readonly stream: MediaStream');
    expect(source).toContain('stop(): Promise');
    expect(source).toContain('cancel(): Promise<void>');
    expect(source).toContain('dispose(): Promise<void>');
  });
});
