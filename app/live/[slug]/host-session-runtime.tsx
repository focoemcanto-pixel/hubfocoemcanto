'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __focoLiveCall?: any;
  }
}

export default function HostSessionRuntime({ slug }: { slug: string }) {
  useEffect(() => {
    const isHostUrl = new URLSearchParams(window.location.search).get('host') === '1';
    if (!isHostUrl) return;

    let remoteFeatured = false;
    let ending = false;
    let attachedVideo: HTMLVideoElement | null = null;
    let currentTrackId = '';

    function hostParticipant(call: any) {
      const participants = Object.values(call?.participants?.() || {}) as any[];
      return participants.find((item) => item?.owner === true)
        || participants.find((item) => String(item?.user_id || '').startsWith('host-'))
        || participants.find((item) => item?.local);
    }

    function clearOwnerOverlay() {
      document.querySelector('[data-host-stage-runtime]')?.remove();
      attachedVideo = null;
      currentTrackId = '';
    }

    function syncHostStage() {
      if (!document.querySelector('.host-studio')) return;
      if (remoteFeatured) {
        clearOwnerOverlay();
        return;
      }

      const call = window.__focoLiveCall;
      const host = hostParticipant(call);
      if (!call || !host) return;

      const target = document.querySelector<HTMLElement>('.fl-room.scene-offer .fl-offer-video')
        || document.querySelector<HTMLElement>('.fl-stage-grid');
      if (!target) return;

      let overlay = target.querySelector<HTMLElement>('[data-host-stage-runtime]');
      if (!overlay) {
        overlay = document.createElement('article');
        overlay.dataset.hostStageRuntime = 'true';
        overlay.className = 'fl-video-tile featured fl-host-stage-runtime';
        overlay.innerHTML = '<video autoplay playsinline muted></video><div class="fl-video-meta"><span>Marcos Cruz</span></div>';
        target.appendChild(overlay);
      }

      const video = overlay.querySelector<HTMLVideoElement>('video');
      const track = host?.tracks?.video?.persistentTrack || host?.videoTrack;
      const trackId = track?.id || '';

      if (!track || host?.video === false) {
        video?.removeAttribute('src');
        if (video) video.srcObject = null;
        overlay.classList.add('camera-off');
        if (!overlay.querySelector('.fl-avatar')) {
          const avatar = document.createElement('div');
          avatar.className = 'fl-avatar';
          avatar.textContent = 'M';
          overlay.insertBefore(avatar, overlay.firstChild);
        }
        return;
      }

      overlay.classList.remove('camera-off');
      overlay.querySelector('.fl-avatar')?.remove();
      if (video && (video !== attachedVideo || trackId !== currentTrackId)) {
        video.srcObject = new MediaStream([track]);
        video.muted = true;
        video.play().catch(() => undefined);
        attachedVideo = video;
        currentTrackId = trackId;
      }
    }

    async function endAndLeave() {
      if (ending) return;
      ending = true;
      const call = window.__focoLiveCall;
      try {
        const response = await fetch(`/api/live/${slug}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end' }),
        });
        if (response.ok) call?.sendAppMessage?.({ type: 'live-ended' }, '*');
      } finally {
        try { await call?.leave?.(); } catch {}
        try { await call?.destroy?.(); } catch {}
        window.location.assign('/admin/foco-live');
      }
    }

    function clickHandler(event: MouseEvent) {
      const element = event.target as HTMLElement | null;
      const button = element?.closest<HTMLButtonElement>('button');
      if (!button) return;

      if (button.title === 'Colocar no palco') {
        remoteFeatured = true;
        clearOwnerOverlay();
        return;
      }

      if (button.textContent?.includes('Modo aula')) {
        remoteFeatured = false;
        window.setTimeout(syncHostStage, 50);
        return;
      }

      if (button.closest('.fl-controls') && button.textContent?.trim().includes('Sair')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void endAndLeave();
      }
    }

    const observer = new MutationObserver(syncHostStage);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', clickHandler, true);
    const timer = window.setInterval(syncHostStage, 500);
    syncHostStage();

    return () => {
      observer.disconnect();
      document.removeEventListener('click', clickHandler, true);
      window.clearInterval(timer);
      clearOwnerOverlay();
    };
  }, [slug]);

  return null;
}
