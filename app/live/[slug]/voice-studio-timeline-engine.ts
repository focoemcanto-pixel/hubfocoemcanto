export type TimelineTickKind = 'bar' | 'beat' | 'subdivision';

export type TimelineTick = {
  id: string;
  time: number;
  left: number;
  kind: TimelineTickKind;
  label?: string;
};

export type TimelineViewport = {
  width: number;
  scrollLeft: number;
};

export type TimelineZoomResult = {
  zoom: number;
  scrollLeft: number;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 12;
const BASE_PIXELS_PER_SECOND = 56;
const MIN_VISIBLE_DURATION = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision = 6) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function normalizeTimelineZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return 1;
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

export function timelinePixelsPerSecond(zoom: number) {
  return BASE_PIXELS_PER_SECOND * normalizeTimelineZoom(zoom);
}

export function timelineContentWidth(duration: number, viewportWidth: number, zoom: number) {
  const safeDuration = Math.max(MIN_VISIBLE_DURATION, Number.isFinite(duration) ? duration : 0);
  const safeViewport = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1);
  return Math.max(safeViewport, safeDuration * timelinePixelsPerSecond(zoom));
}

export function timelineTimeToPixels(time: number, zoom: number) {
  return Math.max(0, time) * timelinePixelsPerSecond(zoom);
}

export function timelinePixelsToTime(pixels: number, zoom: number) {
  return Math.max(0, pixels) / timelinePixelsPerSecond(zoom);
}

export function timelineVisibleRange(viewport: TimelineViewport, zoom: number) {
  const start = timelinePixelsToTime(viewport.scrollLeft, zoom);
  const end = timelinePixelsToTime(viewport.scrollLeft + Math.max(0, viewport.width), zoom);
  return { start, end };
}

export function timelineScrollForTime(time: number, viewportWidth: number, zoom: number, anchor = 0.5) {
  const anchored = timelineTimeToPixels(time, zoom) - Math.max(0, viewportWidth) * clamp(anchor, 0, 1);
  return Math.max(0, anchored);
}

export function timelineZoomAroundPoint(input: {
  zoom: number;
  nextZoom: number;
  scrollLeft: number;
  pointerX: number;
  viewportWidth: number;
  duration: number;
}): TimelineZoomResult {
  const currentZoom = normalizeTimelineZoom(input.zoom);
  const nextZoom = normalizeTimelineZoom(input.nextZoom);
  const pointer = clamp(input.pointerX, 0, Math.max(0, input.viewportWidth));
  const anchorTime = timelinePixelsToTime(Math.max(0, input.scrollLeft) + pointer, currentZoom);
  const nextContentWidth = timelineContentWidth(input.duration, input.viewportWidth, nextZoom);
  const maximumScroll = Math.max(0, nextContentWidth - Math.max(0, input.viewportWidth));
  const nextScroll = timelineTimeToPixels(anchorTime, nextZoom) - pointer;

  return {
    zoom: nextZoom,
    scrollLeft: clamp(nextScroll, 0, maximumScroll),
  };
}

export function timelineSnapTime(time: number, tempo: number, snapDivision: number, enabled = true) {
  const safeTime = Math.max(0, time);
  if (!enabled) return safeTime;
  const beatDuration = 60 / clamp(tempo || 90, 20, 400);
  const division = clamp(snapDivision || 1, 1 / 64, 16);
  const unit = beatDuration * division;
  return round(Math.round(safeTime / unit) * unit);
}

function tickDensity(zoom: number) {
  const pixelsPerSecond = timelinePixelsPerSecond(zoom);
  if (pixelsPerSecond >= 280) return 0.25;
  if (pixelsPerSecond >= 150) return 0.5;
  if (pixelsPerSecond >= 70) return 1;
  return 2;
}

export function createTimelineTicks(input: {
  duration: number;
  tempo: number;
  timeSignature: [number, number];
  zoom: number;
  viewport?: TimelineViewport;
  overscanSeconds?: number;
}): TimelineTick[] {
  const tempo = clamp(input.tempo || 90, 20, 400);
  const beatsPerBar = Math.max(1, Math.round(input.timeSignature?.[0] || 4));
  const beatDuration = 60 / tempo;
  const subdivision = tickDensity(input.zoom);
  const tickDuration = beatDuration * subdivision;
  const duration = Math.max(MIN_VISIBLE_DURATION, input.duration || 0);
  const overscan = Math.max(0, input.overscanSeconds ?? beatDuration * beatsPerBar);
  const visible = input.viewport
    ? timelineVisibleRange(input.viewport, input.zoom)
    : { start: 0, end: duration };
  const start = Math.max(0, visible.start - overscan);
  const end = Math.min(duration, visible.end + overscan);
  const firstIndex = Math.max(0, Math.floor(start / tickDuration));
  const lastIndex = Math.ceil(end / tickDuration);
  const ticks: TimelineTick[] = [];

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const time = round(index * tickDuration);
    if (time > duration + 0.000001) break;
    const beatPosition = index * subdivision;
    const nearestBeat = Math.round(beatPosition);
    const isBeat = Math.abs(beatPosition - nearestBeat) < 0.000001;
    const beatIndex = isBeat ? nearestBeat : -1;
    const isBar = isBeat && beatIndex % beatsPerBar === 0;
    const kind: TimelineTickKind = isBar ? 'bar' : isBeat ? 'beat' : 'subdivision';
    const barNumber = isBar ? beatIndex / beatsPerBar + 1 : 0;

    ticks.push({
      id: `${kind}-${index}`,
      time,
      left: timelineTimeToPixels(time, input.zoom),
      kind,
      label: isBar ? String(barNumber) : undefined,
    });
  }

  return ticks;
}

export function timelineSelectionRange(startPixels: number, endPixels: number, scrollLeft: number, zoom: number) {
  const left = Math.min(startPixels, endPixels) + Math.max(0, scrollLeft);
  const right = Math.max(startPixels, endPixels) + Math.max(0, scrollLeft);
  return {
    start: timelinePixelsToTime(left, zoom),
    end: timelinePixelsToTime(right, zoom),
  };
}

export const TIMELINE_ZOOM_LIMITS = {
  minimum: MIN_ZOOM,
  maximum: MAX_ZOOM,
} as const;
