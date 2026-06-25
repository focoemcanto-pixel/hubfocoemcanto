'use client';

import { useEffect, useRef } from 'react';

function visibleRatio(element: Element) {
  const rect = element.getBoundingClientRect();
  const height = Math.max(1, rect.height);
  const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  return visible / height;
}

export function FeedVideoWarmup() {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

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

      const nextCandidates = [videos[activeIndex + 1], videos[activeIndex + 2]].filter(Boolean) as HTMLVideoElement[];
      nextCandidates.forEach((video) => {
        if (video.dataset.warmed === 'true') return;
        video.dataset.warmed = 'true';
        video.preload = 'auto';
        try {
          video.load();
        } catch {
          // Browser may ignore manual load; native preload still helps when allowed.
        }
      });
    };

    const scheduleWarmup = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(warmupNextVideo);
    };

    const io = new IntersectionObserver(scheduleWarmup, { rootMargin: '560px 0px', threshold: [0, 0.2, 0.5, 0.8] });

    const observeVideos = () => {
      document.querySelectorAll('.community-feed-video').forEach((video) => io.observe(video));
      scheduleWarmup();
    };

    const idleId = 'requestIdleCallback' in window
      ? window.requestIdleCallback(observeVideos, { timeout: 1200 })
      : window.setTimeout(observeVideos, 350);

    window.addEventListener('scroll', scheduleWarmup, { passive: true });
    window.addEventListener('resize', scheduleWarmup);

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', scheduleWarmup);
      window.removeEventListener('resize', scheduleWarmup);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if ('cancelIdleCallback' in window && typeof idleId === 'number') window.cancelIdleCallback(idleId);
      else if (typeof idleId === 'number') window.clearTimeout(idleId);
    };
  }, []);

  return null;
}
