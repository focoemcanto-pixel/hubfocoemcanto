'use client';

import { useEffect } from 'react';

function withFirstFrameHint(src: string) {
  if (!src || src.includes('#t=')) return src;
  return `${src}#t=0.001`;
}

function prepareFeedVideos() {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('.community-feed-video'));

  videos.forEach((video, index) => {
    const rawSrc = video.getAttribute('src') || video.currentSrc || '';
    const hintedSrc = withFirstFrameHint(rawSrc);

    if (hintedSrc && rawSrc !== hintedSrc) {
      const wasPaused = video.paused;
      video.setAttribute('src', hintedSrc);
      video.load();
      if (!wasPaused && index < 2) video.play().catch(() => undefined);
    }

    video.preload = index < 2 ? 'auto' : 'metadata';
  });
}

export function FeedVideoFrameNudge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const firstRun = window.setTimeout(prepareFeedVideos, 80);
    const secondRun = window.setTimeout(prepareFeedVideos, 700);
    const observer = new MutationObserver(() => prepareFeedVideos());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(firstRun);
      window.clearTimeout(secondRun);
      observer.disconnect();
    };
  }, []);

  return null;
}
