import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./voice-studio-controller-audio-capture-slot.ts', import.meta.url),
  'utf8',
);

describe('voice studio controller audio capture slot architecture', () => {
  it('depends only on the legacy audio capture facade contract', () => {
    expect(source).toContain("VoiceStudioLegacyAudioCaptureFacade");
    expect(source).toContain("current: VoiceStudioLegacyAudioCaptureFacade | null");
    expect(source).not.toContain('MediaRecorder');
    expect(source).not.toContain('MediaStream');
    expect(source).not.toContain('getUserMedia');
  });
});
