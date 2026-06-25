'use client';

import { useEffect } from 'react';

function bufferedAhead(video: HTMLVideoElement) {
  try {
    const current = video.currentTime || 0;
    for (let index = 0; index < video.buffered.length; index += 1) {
      const start = video.buffered.start(index);
      const end = video.buffered.end(index);
      if (current >= start && current <= end) return end - current;
    }
  } catch {}
  return 0;
}

function safeLoad(video: HTMLVideoElement) {
  video.preload = 'auto';
  video.setAttribute('preload', 'auto');
  try { video.load(); } catch {}
}

function playWhenReady(video: HTMLVideoElement) {
  if (video.dataset.feedPlayReady === 'true') return;
  const readyEnough = video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA || bufferedAhead(video) >= 1.2;
  if (!readyEnough) return;
  video.dataset.feedPlayReady = 'true';
  video.play().catch(() => { video.dataset.feedPlayReady = 'false'; });
}

function boostVideos() {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('.community-feed-video')).slice(0, 3);

  videos.forEach((video, index) => {
    if (video.dataset.initialBoosted === 'true') return;
    video.dataset.initialBoosted = 'true';
    video.playsInline = true;
    video.muted = video.muted !== false;
    safeLoad(video);

    const retry = () => {
      if (index === 0) playWhenReady(video);
      else safeLoad(video);
    };

    video.addEventListener('loadedmetadata', retry, { passive: true });
    video.addEventListener('loadeddata', retry, { passive: true });
    video.addEventListener('canplay', retry, { passive: true });
    video.addEventListener('progress', retry, { passive: true });
    video.addEventListener('stalled', () => {
      video.dataset.feedPlayReady = 'false';
      safeLoad(video);
      window.setTimeout(retry, 350);
    }, { passive: true });
    video.addEventListener('waiting', () => {
      video.dataset.feedPlayReady = 'false';
      safeLoad(video);
      window.setTimeout(retry, 450);
    }, { passive: true });

    if (index === 0) window.setTimeout(retry, 180);
    if (index === 1) window.setTimeout(() => safeLoad(video), 450);
  });
}

export function FeedInitialVideoBoost() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timeouts = [80, 350, 900, 1600].map((delay) => window.setTimeout(boostVideos, delay));

    const observer = new MutationObserver(() => {
      boostVideos();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const disconnectId = window.setTimeout(() => observer.disconnect(), 6500);

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(disconnectId);
      observer.disconnect();
    };
  }, []);

  return null;
}
