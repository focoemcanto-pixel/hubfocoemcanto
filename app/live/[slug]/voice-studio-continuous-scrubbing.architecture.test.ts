import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./voice-studio-timeline-ruler.tsx', import.meta.url),
  'utf8',
);

describe('Voice Studio continuous scrubbing architecture', () => {
  it('captures the active pointer for uninterrupted scrubbing', () => {
    expect(source).toContain('setPointerCapture(event.pointerId)');
    expect(source).toContain('releasePointerCapture(event.pointerId)');
    expect(source).toContain('onLostPointerCapture={cancelScrubbing}');
  });

  it('seeks continuously while the pointer moves', () => {
    expect(source).toContain('onPointerDown={beginScrubbing}');
    expect(source).toContain('onPointerMove={continueScrubbing}');
    expect(source).toContain('seekFromPointer(event)');
    expect(source).not.toContain('onClick={seek}');
  });

  it('finishes and cancels the interaction safely', () => {
    expect(source).toContain('onPointerUp={finishScrubbing}');
    expect(source).toContain('onPointerCancel={cancelScrubbing}');
    expect(source).toContain("activePointerId.current = null");
  });

  it('clamps seek positions to the timeline duration', () => {
    expect(source).toContain('Math.min(duration, Math.max(0, timelinePixelsToTime(absoluteX, zoom)))');
  });
});
