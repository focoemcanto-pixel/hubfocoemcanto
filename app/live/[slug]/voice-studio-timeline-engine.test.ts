import { describe, expect, it } from 'vitest';

import {
  TIMELINE_ZOOM_LIMITS,
  createTimelineTicks,
  normalizeTimelineVerticalZoom,
  normalizeTimelineZoom,
  timelineContentWidth,
  timelinePixelsToTime,
  timelineScrollForTime,
  timelineSelectionRange,
  timelineSnapTime,
  timelineTimeToPixels,
  timelineTrackHeight,
  timelineVisibleRange,
  timelineZoomAroundPoint,
} from './voice-studio-timeline-engine';

describe('voice-studio-timeline-engine', () => {
  it('converts time to pixels and back within tolerance', () => {
    for (const zoom of [0.5, 1, 2.75, 12]) {
      for (const time of [0, 0.125, 1, 17.333]) {
        const pixels = timelineTimeToPixels(time, zoom);
        expect(timelinePixelsToTime(pixels, zoom)).toBeCloseTo(time, 10);
      }
    }
  });

  it('clamps negative values to zero', () => {
    expect(timelineTimeToPixels(-2, 1)).toBe(0);
    expect(timelinePixelsToTime(-200, 1)).toBe(0);
  });

  it('normalizes horizontal and vertical zoom including non-finite values', () => {
    expect(normalizeTimelineZoom(Number.NaN)).toBe(1);
    expect(normalizeTimelineZoom(0)).toBe(TIMELINE_ZOOM_LIMITS.minimum);
    expect(normalizeTimelineZoom(99)).toBe(TIMELINE_ZOOM_LIMITS.maximum);
    expect(normalizeTimelineVerticalZoom(Number.POSITIVE_INFINITY)).toBe(1);
    expect(normalizeTimelineVerticalZoom(0)).toBe(TIMELINE_ZOOM_LIMITS.verticalMinimum);
  });

  it('calculates track height and content width with minimum bounds', () => {
    expect(timelineTrackHeight(1)).toBe(74);
    expect(timelineContentWidth(0, 300, 1)).toBeGreaterThanOrEqual(300);
    expect(timelineContentWidth(Number.NaN, Number.NaN, 1)).toBeGreaterThanOrEqual(1);
  });

  it('snaps according to tempo and division', () => {
    expect(timelineSnapTime(0.74, 120, 1, true)).toBe(0.5);
    expect(timelineSnapTime(0.74, 120, 0.5, true)).toBe(0.75);
    expect(timelineSnapTime(1.11, 60, 0.25, true)).toBe(1);
  });

  it('returns clamped raw time when snapping is disabled', () => {
    expect(timelineSnapTime(1.23456789, 120, 0.5, false)).toBe(1.23456789);
    expect(timelineSnapTime(-3, 120, 0.5, false)).toBe(0);
  });

  it('handles zero and out-of-range tempo and division through current clamps', () => {
    expect(timelineSnapTime(1, 0, 0, true)).toBeCloseTo(2 / 3, 6);
    expect(timelineSnapTime(1, 1000, 100, true)).toBe(0);
  });

  it('calculates visible range, scrolling and selection ranges', () => {
    const viewport = { width: 560, height: 200, scrollLeft: 112, scrollTop: 0 };
    expect(timelineVisibleRange(viewport, 1)).toEqual({ start: 2, end: 12 });
    expect(timelineScrollForTime(10, 560, 1, 0.5)).toBe(280);
    expect(timelineSelectionRange(100, 20, 56, 1)).toEqual({ start: 76 / 56, end: 156 / 56 });
  });

  it('zooms around a point while preserving a bounded anchor', () => {
    const result = timelineZoomAroundPoint({
      zoom: 1,
      nextZoom: 2,
      scrollLeft: 100,
      pointerX: 200,
      viewportWidth: 800,
      duration: 30,
    });

    expect(result.zoom).toBe(2);
    expect(result.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(result.scrollLeft).toBeLessThanOrEqual(timelineContentWidth(30, 800, 2) - 800);
  });

  it('creates deterministic bars, beats and labels', () => {
    const ticks = createTimelineTicks({ duration: 8, tempo: 120, timeSignature: [4, 4], zoom: 2 });
    expect(ticks[0]).toMatchObject({ time: 0, kind: 'bar', label: '1' });
    expect(ticks.some(tick => tick.kind === 'beat')).toBe(true);
    expect(ticks.some(tick => tick.kind === 'bar' && tick.label === '2')).toBe(true);
  });
});
