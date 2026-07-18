'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeTimelineZoom as clampTimelineZoom,
  timelineContentWidth,
  timelinePixelsToTime,
  timelineScrollForTime,
  timelineTimeToPixels,
  timelineZoomAroundPoint,
  type TimelineViewport,
} from './voice-studio-timeline-engine';

export type TimelineViewState = {
  zoom: number;
  scrollLeft: number;
  playhead: number;
};

export type UseVoiceStudioTimelineOptions = {
  duration: number;
  view: TimelineViewState;
  disabled?: boolean;
  onViewChange: (view: TimelineViewState) => void;
};

const AUTO_SCROLL_EDGE = 0.78;
const AUTO_SCROLL_ANCHOR = 0.34;

export function useVoiceStudioTimeline({
  duration,
  view,
  disabled = false,
  onViewChange,
}: UseVoiceStudioTimelineOptions) {
  const elementRef = useRef<HTMLElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollRef = useRef(view.scrollLeft);
  const [viewport, setViewport] = useState<TimelineViewport>({
    width: 1,
    scrollLeft: Math.max(0, view.scrollLeft),
  });

  const zoom = clampTimelineZoom(view.zoom);
  const contentWidth = useMemo(
    () => timelineContentWidth(duration, viewport.width, zoom),
    [duration, viewport.width, zoom],
  );

  const setElement = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
    if (!node) return;
    const width = Math.max(1, node.clientWidth);
    const scrollLeft = Math.max(0, Math.min(node.scrollLeft, Math.max(0, node.scrollWidth - width)));
    setViewport({ width, scrollLeft });
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const width = Math.max(1, entries[0]?.contentRect.width ?? element.clientWidth);
      setViewport(current => ({ ...current, width }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [setElement]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const maxScroll = Math.max(0, contentWidth - viewport.width);
    const nextScroll = Math.max(0, Math.min(view.scrollLeft, maxScroll));
    if (Math.abs(element.scrollLeft - nextScroll) > 0.5) element.scrollLeft = nextScroll;
    setViewport(current => Math.abs(current.scrollLeft - nextScroll) > 0.5 ? { ...current, scrollLeft: nextScroll } : current);
  }, [contentWidth, view.scrollLeft, viewport.width]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const persistScroll = useCallback((scrollLeft: number) => {
    pendingScrollRef.current = scrollLeft;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      onViewChange({ ...view, zoom, scrollLeft: pendingScrollRef.current });
    });
  }, [onViewChange, view, zoom]);

  const onScroll = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    const scrollLeft = Math.max(0, element.scrollLeft);
    setViewport(current => ({ ...current, scrollLeft }));
    persistScroll(scrollLeft);
  }, [persistScroll]);

  const seekAtClientX = useCallback((clientX: number, quantize?: (time: number) => number) => {
    const element = elementRef.current;
    if (!element || disabled) return view.playhead;
    const bounds = element.getBoundingClientRect();
    const absoluteX = clientX - bounds.left + element.scrollLeft;
    const rawTime = timelinePixelsToTime(absoluteX, zoom);
    const nextPlayhead = Math.max(0, Math.min(duration, quantize ? quantize(rawTime) : rawTime));
    onViewChange({ ...view, zoom, scrollLeft: element.scrollLeft, playhead: nextPlayhead });
    return nextPlayhead;
  }, [disabled, duration, onViewChange, view, zoom]);

  const setZoom = useCallback((nextZoom: number, anchorClientX?: number) => {
    const element = elementRef.current;
    const requestedZoom = clampTimelineZoom(nextZoom);
    if (!element) {
      onViewChange({ ...view, zoom: requestedZoom });
      return;
    }
    const bounds = element.getBoundingClientRect();
    const pointerX = anchorClientX === undefined
      ? viewport.width / 2
      : Math.max(0, Math.min(viewport.width, anchorClientX - bounds.left));
    const result = timelineZoomAroundPoint({
      zoom,
      nextZoom: requestedZoom,
      scrollLeft: element.scrollLeft,
      pointerX,
      viewportWidth: viewport.width,
      duration,
    });
    element.scrollLeft = result.scrollLeft;
    setViewport(current => ({ ...current, scrollLeft: result.scrollLeft }));
    onViewChange({ ...view, zoom: result.zoom, scrollLeft: result.scrollLeft });
  }, [duration, onViewChange, view, viewport.width, zoom]);

  const onWheel = useCallback((event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom(zoom + direction * Math.max(0.1, zoom * 0.12), event.clientX);
  }, [setZoom, zoom]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const ensureTimeVisible = useCallback((time: number, force = false) => {
    const element = elementRef.current;
    if (!element) return;
    const x = timelineTimeToPixels(time, zoom);
    const visibleStart = element.scrollLeft;
    const threshold = visibleStart + viewport.width * AUTO_SCROLL_EDGE;
    if (!force && x >= visibleStart && x <= threshold) return;
    const anchor = !force && x < visibleStart ? 0.08 : AUTO_SCROLL_ANCHOR;
    const next = timelineScrollForTime(time, viewport.width, zoom, anchor);
    element.scrollLeft = next;
  }, [viewport.width, zoom]);

  const timeFromClientX = useCallback((clientX: number) => {
    const element = elementRef.current;
    if (!element) return 0;
    const bounds = element.getBoundingClientRect();
    return timelinePixelsToTime(clientX - bounds.left + element.scrollLeft, zoom);
  }, [zoom]);

  return {
    elementRef,
    setElement,
    viewport,
    zoom,
    contentWidth,
    onScroll,
    setZoom,
    seekAtClientX,
    timeFromClientX,
    ensureTimeVisible,
  };
}
