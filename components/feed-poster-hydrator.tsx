'use client';

import { useEffect } from 'react';
import { inferredPosterUrl } from '@/lib/video/poster';

function applyPosters() {
  document.querySelectorAll<HTMLVideoElement>('.community-feed-video').forEach((video) => {
    if (video.poster || !video.currentSrc && !video.src) return;
    const poster = inferredPosterUrl(video.currentSrc || video.src);
    if (poster && poster !== video.src) video.poster = poster;
  });
}

export function FeedPosterHydrator() {
  useEffect(() => {
    applyPosters();
    const observer = new MutationObserver(applyPosters);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(applyPosters, 1200);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
