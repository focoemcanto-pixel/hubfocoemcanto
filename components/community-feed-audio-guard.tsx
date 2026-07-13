'use client';

import { useEffect } from 'react';

/**
 * Keeps the user's sound choice authoritative in the community feed.
 * The feed starts videos muted for autoplay, but older visibility/load effects
 * can re-apply `muted` after the user taps the sound button. This guard only
 * intervenes after an explicit user gesture and never enables sound by itself.
 */
export function CommunityFeedAudioGuard() {
  useEffect(() => {
    let activePostId: string | null = null;
    let soundEnabled = false;

    const videos = () => Array.from(document.querySelectorAll<HTMLVideoElement>('.community-feed-video'));

    const applyChoice = () => {
      for (const video of videos()) {
        const isActive = soundEnabled && Boolean(activePostId) && video.dataset.postId === activePostId;
        video.volume = 1;
        video.muted = !isActive;
        if (isActive) {
          video.removeAttribute('muted');
          if (video.paused) void video.play().catch(() => undefined);
        } else {
          video.setAttribute('muted', '');
        }
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>('.home-sound-toggle');
      if (!button) return;
      const article = button.closest<HTMLElement>('.instagram-post-card');
      const video = article?.querySelector<HTMLVideoElement>('.community-feed-video');
      if (!video?.dataset.postId) return;

      const postId = video.dataset.postId;
      const enabling = activePostId !== postId || !soundEnabled || video.muted;
      activePostId = enabling ? postId : null;
      soundEnabled = enabling;

      // React effects, autoplay fallbacks and IntersectionObserver callbacks may
      // run immediately after the click. Re-apply the explicit user choice after
      // each of those phases.
      window.setTimeout(applyChoice, 0);
      window.setTimeout(applyChoice, 80);
      window.setTimeout(applyChoice, 240);
    };

    const onPlay = (event: Event) => {
      const video = event.target as HTMLVideoElement;
      if (!video.classList?.contains('community-feed-video')) return;
      if (soundEnabled && video.dataset.postId === activePostId) {
        window.setTimeout(applyChoice, 0);
      }
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('play', onPlay, true);
    const interval = window.setInterval(() => {
      if (soundEnabled && activePostId) applyChoice();
    }, 500);

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('play', onPlay, true);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
