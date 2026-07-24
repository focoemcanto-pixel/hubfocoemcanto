'use client';

import { useEffect } from 'react';

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };

export default function LiveMirrorFixRuntime() {
  useEffect(() => {
    let disposed = false;

    const apply = () => {
      if (disposed) return;
      const room = document.querySelector<HTMLElement>('.fl-room');
      const call = (window as LiveWindow).__FOCO_LIVE_CALL__;
      const local = call?.participants?.()?.local;
      const localTrack = local?.tracks?.video?.persistentTrack || local?.tracks?.video?.track || local?.videoTrack;
      const localTrackId = localTrack?.id;
      const mirrored = room?.classList.contains('fl-local-preview-mirrored') || window.localStorage.getItem('foco-live-mirror-preview') === 'true';

      document.querySelectorAll<HTMLElement>('.fl-video-tile').forEach((tile) => {
        const video = tile.querySelector<HTMLVideoElement>('.fl-video-frame video');
        const meta = tile.querySelector<HTMLElement>('.fl-video-meta');
        if (!video) return;

        const stream = video.srcObject as MediaStream | null;
        const trackId = stream?.getVideoTracks?.()[0]?.id;
        const isLocalByTrack = Boolean(localTrackId && trackId === localTrackId);
        const isLocalByLabel = /\(você\)|\(voce\)/i.test(meta?.textContent || '');
        const isLocal = isLocalByTrack || isLocalByLabel || video.muted;
        const frame = video.closest<HTMLElement>('.fl-video-frame');

        if (isLocal) {
          video.dataset.localPreview = 'true';
          tile.dataset.localPreview = 'true';
          // Flip the frame itself instead of relying only on the video element.
          // This makes the change visible even when other live-layout CSS rewrites
          // the video's transform during layout updates.
          frame?.style.setProperty('transform', mirrored ? 'scaleX(-1)' : 'scaleX(1)', 'important');
          frame?.style.setProperty('transform-origin', 'center center', 'important');
          video.style.setProperty('transform', 'none', 'important');
        } else if (tile.dataset.localPreview === 'true') {
          delete tile.dataset.localPreview;
          delete video.dataset.localPreview;
          frame?.style.removeProperty('transform');
          frame?.style.removeProperty('transform-origin');
          video.style.removeProperty('transform');
        }
      });
    };

    const onPreferenceChanged = () => apply();
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    const timer = window.setInterval(apply, 120);
    window.addEventListener('foco-mirror-preview-changed', onPreferenceChanged);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener('foco-mirror-preview-changed', onPreferenceChanged);
    };
  }, []);

  return null;
}
