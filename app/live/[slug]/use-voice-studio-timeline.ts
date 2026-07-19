'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeTimelineVerticalZoom,
  normalizeTimelineZoom,
  timelineContentWidth,
  timelinePixelsToTime,
  timelineScrollForTime,
  timelineTimeToPixels,
  timelineZoomAroundPoint,
  type TimelineViewport,
} from './voice-studio-timeline-engine';

export type TimelineViewState = {
  zoom: number;
  verticalZoom: number;
  scrollLeft: number;
  scrollTop: number;
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
    height: 1,
    scrollLeft: Math.max(0, view.scrollLeft),
    scrollTop: Math.max(0, view.scrollTop),
  });

  const zoom = normalizeTimelineZoom(view.zoom);
  const verticalZoom = normalizeTimelineVerticalZoom(view.verticalZoom);
  const contentWidth = useMemo(
    () => timelineContentWidth(duration, viewport.width, zoom),
    [duration, viewport.width, zoom],
  );

  const setElement = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
    if (!node) return;
    const width = Math.max(1, node.clientWidth);
    const height = Math.max(1, node.clientHeight);
    const scrollLeft = Math.max(0, Math.min(node.scrollLeft, Math.max(0, node.scrollWidth - width)));
    const scrollTop = Math.max(0, Math.min(node.scrollTop, Math.max(0, node.scrollHeight - height)));
    setViewport({ width, height, scrollLeft, scrollTop });
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const width = Math.max(1, entries[0]?.contentRect.width ?? element.clientWidth);
      const height = Math.max(1, entries[0]?.contentRect.height ?? element.clientHeight);
      setViewport(current => ({ ...current, width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [setElement]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const maxScroll = Math.max(0, contentWidth - viewport.width);
    const nextScroll = Math.max(0, Math.min(view.scrollLeft, maxScroll));
    const nextTop = Math.max(0, view.scrollTop || 0);
    if (Math.abs(element.scrollLeft - nextScroll) > 0.5) element.scrollLeft = nextScroll;
    if (Math.abs(element.scrollTop - nextTop) > 0.5) element.scrollTop = nextTop;
    setViewport(current => (Math.abs(current.scrollLeft - nextScroll) > 0.5 || Math.abs(current.scrollTop - nextTop) > 0.5) ? { ...current, scrollLeft: nextScroll, scrollTop: nextTop } : current);
  }, [contentWidth, view.scrollLeft, view.scrollTop, viewport.width]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const persistScroll = useCallback((scrollLeft: number) => {
    pendingScrollRef.current = scrollLeft;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      onViewChange({ ...view, zoom, verticalZoom, scrollLeft: pendingScrollRef.current, scrollTop: elementRef.current?.scrollTop ?? view.scrollTop });
    });
  }, [onViewChange, view, zoom, verticalZoom]);

  const onScroll = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    const scrollLeft = Math.max(0, element.scrollLeft);
    const scrollTop = Math.max(0, element.scrollTop);
    setViewport(current => ({ ...current, scrollLeft, scrollTop }));
    persistScroll(scrollLeft);
  }, [persistScroll]);

  const seekAtClientX = useCallback((clientX: number, quantize?: (time: number) => number) => {
    const element = elementRef.current;
    if (!element || disabled) return view.playhead;
    const bounds = element.getBoundingClientRect();
    const absoluteX = clientX - bounds.left + element.scrollLeft;
    const rawTime = timelinePixelsToTime(absoluteX, zoom);
    const nextPlayhead = Math.max(0, Math.min(duration, quantize ? quantize(rawTime) : rawTime));
    onViewChange({ ...view, zoom, verticalZoom, scrollLeft: element.scrollLeft, scrollTop: element.scrollTop, playhead: nextPlayhead });
    return nextPlayhead;
  }, [disabled, duration, onViewChange, view, zoom, verticalZoom]);

  const setZoom = useCallback((nextZoom: number, anchorClientX?: number) => {
    const element = elementRef.current;
    const clamped = normalizeTimelineZoom(nextZoom);
    if (!element) {
      onViewChange({ ...view, zoom: clamped });
      return;
    }
    const bounds = element.getBoundingClientRect();
    const pointerX = anchorClientX === undefined
      ? viewport.width / 2
      : Math.max(0, Math.min(viewport.width, anchorClientX - bounds.left));
    const result = timelineZoomAroundPoint({
      zoom,
      nextZoom: clamped,
      scrollLeft: element.scrollLeft,
      pointerX,
      viewportWidth: viewport.width,
      duration,
    });
    element.scrollLeft = result.scrollLeft;
    setViewport(current => ({ ...current, scrollLeft: result.scrollLeft }));
    onViewChange({ ...view, zoom: result.zoom, verticalZoom, scrollLeft: result.scrollLeft, scrollTop: element.scrollTop });
  }, [duration, onViewChange, view, viewport.width, zoom, verticalZoom]);

  const onWheel = useCallback((event: WheelEvent) => {
    if (event.shiftKey && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      onViewChange({ ...view, zoom, verticalZoom: normalizeTimelineVerticalZoom(verticalZoom + direction * 0.12), scrollLeft: elementRef.current?.scrollLeft ?? view.scrollLeft, scrollTop: elementRef.current?.scrollTop ?? view.scrollTop });
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom(zoom + direction * Math.max(0.1, zoom * 0.12), event.clientX);
  }, [onViewChange, setZoom, verticalZoom, view, zoom]);

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
    if (!force && x < visibleStart) {
      const next = timelineScrollForTime(time, viewport.width, zoom, 0.08);
      element.scrollLeft = next;
      return;
    }
    const next = timelineScrollForTime(time, viewport.width, zoom, AUTO_SCROLL_ANCHOR);
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
    verticalZoom,
    setZoom,
    seekAtClientX,
    timeFromClientX,
    ensureTimeVisible,
  };
}
