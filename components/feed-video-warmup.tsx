'use client';

import { useEffect, useRef } from 'react';

type WindowWithIdle = Window & typeof globalThis & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function visibleRatio(element: Element) {
  const rect = element.getBoundingClientRect();
  const height = Math.max(1, rect.height);
  const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  return visible / height;
}

function shouldSkipVideoWarmup() {
  if (typeof window === 'undefined') return true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const isSmallScreen = window.matchMedia('(max-width: 760px)').matches;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isSlowConnection = Boolean(connection?.saveData) || ['slow-2g', '2g', '3g'].includes(String(connection?.effectiveType || ''));
  return isSlowConnection || (isSmallScreen && isCoarsePointer);
}

export function FeedVideoWarmup() {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (shouldSkipVideoWarmup()) return;

    const browserWindow = window as WindowWithIdle;

    const warmupNextVideo = () => {
      rafRef.current = null;
      const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('.community-feed-video'));
      if (videos.length < 2) return;

      let activeIndex = -1;
      let activeRatio = 0;

      videos.forEach((video, index) => {
        const ratio = visibleRatio(video);
        if (ratio > activeRatio) {
          activeRatio = ratio;
          activeIndex = index;
        }
      });

      if (activeIndex < 0 || activeRatio < 0.2) return;

      const nextVideo = videos[activeIndex + 1];
      if (!nextVideo || nextVideo.dataset.warmed === 'true') return;
      nextVideo.dataset.warmed = 'true';
      nextVideo.preload = 'auto';
      try {
        nextVideo.load();
      } catch {
        // Browser may ignore manual load; native preload still helps when allowed.
      }
    };

    const scheduleWarmup = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(warmupNextVideo);
    };

    const io = new IntersectionObserver(scheduleWarmup, { rootMargin: '420px 0px', threshold: [0, 0.3, 0.7] });

    const observeVideos = () => {
      document.querySelectorAll('.community-feed-video').forEach((video) => io.observe(video));
      scheduleWarmup();
    };

    const idleId = browserWindow.requestIdleCallback
      ? browserWindow.requestIdleCallback(observeVideos, { timeout: 1800 })
      : globalThis.setTimeout(observeVideos, 900);

    window.addEventListener('resize', scheduleWarmup);

    return () => {
      io.disconnect();
      window.removeEventListener('resize', scheduleWarmup);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (browserWindow.cancelIdleCallback && typeof idleId === 'number') browserWindow.cancelIdleCallback(idleId);
      else globalThis.clearTimeout(idleId);
    };
  }, []);

  return null;
}
