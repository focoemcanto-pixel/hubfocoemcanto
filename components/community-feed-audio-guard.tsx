'use client';

import { useEffect } from 'react';

/**
 * Keeps the user's explicit sound choice authoritative in the community feed.
 * Videos still begin muted for autoplay, but after the user enables one post,
 * load/visibility effects are no longer allowed to mute that same video again.
 */
export function CommunityFeedAudioGuard() {
  useEffect(() => {
    let activePostId: string | null = null;
    let soundEnabled = false;
    let applying = false;

    const videos = () => Array.from(document.querySelectorAll<HTMLVideoElement>('.community-feed-video'));

    const applyChoice = () => {
      if (applying) return;
      applying = true;
      try {
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
      } finally {
        applying = false;
      }
    };

    const scheduleChoice = () => {
      window.requestAnimationFrame(applyChoice);
      window.setTimeout(applyChoice, 0);
      window.setTimeout(applyChoice, 80);
      window.setTimeout(applyChoice, 240);
      window.setTimeout(applyChoice, 700);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>('.home-sound-toggle');
      if (!button) return;
      const article = button.closest<HTMLElement>('.instagram-post-card');
      const video = article?.querySelector<HTMLVideoElement>('.community-feed-video');
      const postId = video?.dataset.postId;
      if (!postId) return;

      const disablingCurrent = soundEnabled && activePostId === postId;
      activePostId = disablingCurrent ? null : postId;
      soundEnabled = !disablingCurrent;
      scheduleChoice();
    };

    const onMediaEvent = (event: Event) => {
      const video = event.target as HTMLVideoElement;
      if (!video.classList?.contains('community-feed-video')) return;
      if (soundEnabled && video.dataset.postId === activePostId) scheduleChoice();
    };

    const observer = new MutationObserver((mutations) => {
      if (applying || !soundEnabled || !activePostId) return;
      const activeWasChanged = mutations.some((mutation) => {
        const video = mutation.target as HTMLVideoElement;
        return video.classList?.contains('community-feed-video') && video.dataset.postId === activePostId;
      });
      if (activeWasChanged) scheduleChoice();
    });

    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['muted', 'src'],
    });

    document.addEventListener('click', onClick, true);
    document.addEventListener('play', onMediaEvent, true);
    document.addEventListener('loadedmetadata', onMediaEvent, true);
    document.addEventListener('loadeddata', onMediaEvent, true);
    document.addEventListener('canplay', onMediaEvent, true);

    const interval = window.setInterval(() => {
      if (soundEnabled && activePostId) applyChoice();
    }, 250);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('play', onMediaEvent, true);
      document.removeEventListener('loadedmetadata', onMediaEvent, true);
      document.removeEventListener('loadeddata', onMediaEvent, true);
      document.removeEventListener('canplay', onMediaEvent, true);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
