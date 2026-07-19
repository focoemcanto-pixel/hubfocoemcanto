import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./voice-studio-timeline-canvas.tsx', import.meta.url)), 'utf8');

describe('VoiceStudioTimelineCanvas legacy compatibility', () => {
  it('accepts onBeginRecord without invoking recording from Timeline', () => {
    expect(source).toContain('onBeginRecord?: () => void');
    expect(source).not.toContain('onBeginRecord()');
    expect(source).not.toContain('onBeginRecord?.()');
  });
});
