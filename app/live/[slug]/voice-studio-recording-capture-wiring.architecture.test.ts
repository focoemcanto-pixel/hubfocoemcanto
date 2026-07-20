import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hook = readFileSync(new URL('./use-voice-studio-legacy-recording-intent.ts', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('./voice-studio-legacy-recording-intent-bridge.ts', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('./voice-studio-legacy-recording-capture-adapter.ts', import.meta.url), 'utf8');

describe('recording capture wiring architecture', () => {
  it('routes visible Record intent through the Session capture lifecycle', () => {
    expect(hook).toContain('session.recordingCapture.start');
    expect(hook).toContain('session.recordingCapture.stop');
    expect(hook).toContain('createLegacyRecordingCaptureAdapter');
  });

  it('does not click hidden legacy controls', () => {
    expect(bridge).not.toContain('.click()');
    expect(bridge).not.toContain('RECORD_BUTTON_SELECTOR');
    expect(bridge).toContain("new KeyboardEvent('keydown'");
  });

  it('adapts stop and cancel to the lifecycle contract', () => {
    expect(adapter).toContain('VoiceStudioCaptureHandle');
    expect(adapter).toContain('stop: close');
    expect(adapter).toContain('cancel: close');
  });
});
