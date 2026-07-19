import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./voice-studio-timeline-view.tsx', import.meta.url)),
  'utf8',
);

describe('VoiceStudioTimelineView architecture', () => {
  it('depends on Session and events, not playback or recording modules', () => {
    expect(source).toContain("import type { VoiceStudioSession } from './voice-studio-session-types'");
    expect(source).toContain('session.eventBus.subscribe');
    expect(source).not.toContain("from './voice-studio-playback'");
    expect(source).not.toContain("from './voice-studio-recording'");
    expect(source).not.toContain("from './voice-studio-project-actions'");
    expect(source).not.toContain("from './voice-studio-transport-controller'");
  });

  it('does not expose transport, playback, recording or mutation callbacks', () => {
    expect(source).not.toMatch(/onPlay\s*[?:]/);
    expect(source).not.toMatch(/onStop\s*[?:]/);
    expect(source).not.toMatch(/onRecord\s*[?:]/);
    expect(source).not.toMatch(/onSeek\s*[?:]/);
    expect(source).not.toMatch(/onMoveClip\s*[?:]/);
    expect(source).not.toMatch(/onTrim\s*[?:]/);
  });
});
