import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(fileName: string) {
  return readFileSync(fileURLToPath(new URL(`./${fileName}`, import.meta.url)), 'utf8');
}

describe('Voice Studio safe performance boundaries', () => {
  it('keeps the Session stable when Provider props change', () => {
    const provider = source('voice-studio-provider.tsx');
    expect(provider).toContain('useRef<VoiceStudioSession | null>');
    expect(provider).toContain('sessionRef.current ??= createVoiceStudioSession()');
    expect(provider).not.toContain('session: createVoiceStudioSession()');
  });

  it('memoizes Timeline lanes independently from playhead renders', () => {
    const timeline = source('voice-studio-timeline-view.tsx');
    expect(timeline).toContain('const TimelineLane = memo(');
    expect(timeline).toContain('const TimelineClip = memo(');
    expect(timeline).toContain('const EMPTY_WAVEFORM');
    expect(timeline).not.toContain("Array.from({ length: 80 }, () => 0.04);\n  return <svg");
  });
});
