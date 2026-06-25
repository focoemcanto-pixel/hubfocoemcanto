'use client';

import { useEffect } from 'react';
import { inferredPosterUrl } from '@/lib/video/poster';

const CACHE_PREFIX = 'hub-feed-poster:';

function cacheKey(src: string) {
  return `${CACHE_PREFIX}${src}`;
}

function captureVideoPoster(video: HTMLVideoElement, src: string) {
  try {
    if (!video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 520 / Math.max(1, video.videoWidth));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.62);
    if (dataUrl.length > 2000 && dataUrl.length < 900000) {
      window.localStorage.setItem(cacheKey(src), dataUrl);
      if (!video.poster) video.poster = dataUrl;
    }
  } catch {
    // Some cross-origin videos cannot be captured; the inferred poster path still helps for new uploads.
  }
}

function applyPosters() {
  document.querySelectorAll<HTMLVideoElement>('.community-feed-video').forEach((video) => {
    const src = video.currentSrc || video.src;
    if (!src) return;

    const cached = window.localStorage.getItem(cacheKey(src));
    if (cached && video.poster !== cached) video.poster = cached;

    if (!video.poster) {
      const inferred = inferredPosterUrl(src);
      if (inferred && inferred !== src) video.poster = inferred;
    }

    if (video.dataset.posterCaptureBound === 'true') return;
    video.dataset.posterCaptureBound = 'true';
    video.addEventListener('loadeddata', () => captureVideoPoster(video, src), { once: true });
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
