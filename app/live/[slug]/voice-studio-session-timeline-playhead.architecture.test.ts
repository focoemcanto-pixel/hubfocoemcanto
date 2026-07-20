import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'app/live/[slug]/voice-studio-timeline-canvas.tsx');
const source = fs.readFileSync(file, 'utf8');

describe('Session-owned Timeline playhead', () => {
  it('consumes the official playhead hook', () => {
    expect(source).toContain("import { useVoiceStudioPlayhead } from './use-voice-studio-playhead';");
    expect(source).toContain('const { playhead: visualPlayhead } = useVoiceStudioPlayhead();');
  });

  it('renders ruler and cursor from the Session playhead', () => {
    expect(source).toContain('playhead={visualPlayhead}');
    expect(source).toContain('timelineTimeToPixels(visualPlayhead, zoom)');
    expect(source).toContain('data-playhead-source="session"');
  });

  it('keeps the legacy elapsed clock only for live recording width', () => {
    expect(source).toContain('Math.max(0, elapsed - recordStart)');
    expect(source).not.toContain('playhead={elapsed}');
    expect(source).not.toContain('timelineTimeToPixels(elapsed, zoom)}px');
  });

  it('preserves editing and seek contracts', () => {
    expect(source).toContain('onSeek?: (time: number) => void;');
    expect(source).toContain('onSelectClip?:');
    expect(source).toContain('onBeginDrag?:');
    expect(source).toContain('onMoveDrag?:');
    expect(source).toContain('onEndDrag?:');
  });
});
