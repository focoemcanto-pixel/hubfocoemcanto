'use client';

import { useEffect } from 'react';

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };
type ViewSettings = { fit?: 'cover' | 'contain'; zoom?: number; x?: number; y?: number };

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
      let view: ViewSettings = {};
      try { view = JSON.parse(window.localStorage.getItem('foco-live-video-view') || '{}'); } catch {}
      const fit = view.fit === 'contain' ? 'contain' : 'cover';
      const zoom = Math.min(2, Math.max(1, Number(view.zoom || 100) / 100));
      const x = Math.min(100, Math.max(0, Number(view.x ?? 50)));
      const y = Math.min(100, Math.max(0, Number(view.y ?? 50)));

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
          frame?.style.setProperty('transform', mirrored ? 'scaleX(-1)' : 'scaleX(1)', 'important');
          frame?.style.setProperty('transform-origin', 'center center', 'important');
          video.style.setProperty('object-fit', fit, 'important');
          video.style.setProperty('object-position', `${x}% ${y}%`, 'important');
          video.style.setProperty('transform', `scale(${zoom})`, 'important');
          video.style.setProperty('transform-origin', `${x}% ${y}%`, 'important');
        } else if (tile.dataset.localPreview === 'true') {
          delete tile.dataset.localPreview;
          delete video.dataset.localPreview;
          frame?.style.removeProperty('transform');
          frame?.style.removeProperty('transform-origin');
          video.style.removeProperty('object-fit');
          video.style.removeProperty('object-position');
          video.style.removeProperty('transform');
          video.style.removeProperty('transform-origin');
        }
      });
    };

    const onPreferenceChanged = () => apply();
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    const timer = window.setInterval(apply, 120);
    window.addEventListener('foco-mirror-preview-changed', onPreferenceChanged);
    window.addEventListener('foco-video-view-changed', onPreferenceChanged);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener('foco-mirror-preview-changed', onPreferenceChanged);
      window.removeEventListener('foco-video-view-changed', onPreferenceChanged);
    };
  }, []);

  return null;
}
