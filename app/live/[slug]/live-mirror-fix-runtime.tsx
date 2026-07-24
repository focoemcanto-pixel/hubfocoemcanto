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

      document.querySelectorAll<HTMLVideoElement>('.fl-video-frame video').forEach((video) => {
        const stream = video.srcObject as MediaStream | null;
        const trackId = stream?.getVideoTracks?.()[0]?.id;
        if (localTrackId && trackId === localTrackId) {
          video.dataset.localPreview = 'true';
          video.style.setProperty('transform', mirrored ? 'scaleX(-1)' : 'scaleX(1)', 'important');
        } else if (video.dataset.localPreview === 'true') {
          delete video.dataset.localPreview;
          video.style.removeProperty('transform');
        }
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const timer = window.setInterval(apply, 250);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
