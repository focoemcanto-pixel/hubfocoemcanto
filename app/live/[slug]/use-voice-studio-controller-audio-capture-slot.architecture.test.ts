import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./use-voice-studio-controller-audio-capture-slot.ts', import.meta.url),
  'utf8',
);

describe('voice studio controller audio capture slot hook architecture', () => {
  it('creates one stable slot without owning browser capture APIs', () => {
    expect(source).toContain('useRef<VoiceStudioControllerAudioCaptureSlot | null>(null)');
    expect(source).toContain('createVoiceStudioControllerAudioCaptureSlot()');
    expect(source).not.toContain('MediaRecorder');
    expect(source).not.toContain('MediaStream');
    expect(source).not.toContain('getUserMedia');
  });
});
