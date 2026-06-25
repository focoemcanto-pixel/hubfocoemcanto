'use client';

import { useEffect } from 'react';

function boostFirstVideo() {
  const firstVideo = document.querySelector<HTMLVideoElement>('.community-feed-video');
  if (!firstVideo || firstVideo.dataset.initialBoosted === 'true') return;

  firstVideo.dataset.initialBoosted = 'true';
  firstVideo.preload = 'auto';

  try {
    firstVideo.load();
    firstVideo.play().catch(() => undefined);
  } catch {
    // Browsers may block/ignore manual loading; the preload hint still helps.
  }
}

export function FeedInitialVideoBoost() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timeoutId = window.setTimeout(boostFirstVideo, 80);

    const observer = new MutationObserver(() => {
      boostFirstVideo();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.setTimeout(() => observer.disconnect(), 3500);

    return () => {
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, []);

  return null;
}
