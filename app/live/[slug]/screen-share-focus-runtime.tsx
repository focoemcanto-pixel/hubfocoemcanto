'use client';

import { useEffect } from 'react';

const STYLE_ID = 'fl-screen-share-focus-style';
const FOCUS_CLASS = 'fl-presentation-focus-mode';

export default function ScreenShareFocusRuntime() {
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (options?: any) => Promise<MediaStream> };
    const original = mediaDevices.getDisplayMedia?.bind(mediaDevices);

    if (original) {
      mediaDevices.getDisplayMedia = async (options: any = {}) => {
        const CaptureControllerCtor = (window as any).CaptureController;
        if (!CaptureControllerCtor) return original(options);

        const controller = new CaptureControllerCtor();
        const stream = await original({ ...options, controller });
        try { controller.setFocusBehavior('no-focus-change'); } catch {}
        window.setTimeout(() => window.focus(), 0);
        return stream;
      };
    }

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .fl-screen-presentation-actions{position:absolute;z-index:45;right:12px;top:12px;display:flex;gap:8px}
        .fl-screen-presentation-actions button{width:42px;height:42px;border:1px solid rgba(255,255,255,.18);border-radius:50%;display:grid;place-items:center;background:rgba(17,20,27,.82);color:#fff;font-size:20px;font-weight:900;box-shadow:0 8px 24px rgba(0,0,0,.32);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
        .fl-screen-presentation-actions button.active{background:#7c3aed;border-color:#a78bfa}
        .fl-screen-tile:fullscreen,.fl-screen-tile:-webkit-full-screen{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;border:0!important;border-radius:0!important;background:#000!important}
        .fl-screen-tile:fullscreen video,.fl-screen-tile:-webkit-full-screen video{width:100%!important;height:100%!important;object-fit:contain!important;background:#000!important}
        .fl-room.${FOCUS_CLASS}{position:fixed!important;inset:0!important;z-index:99999!important;width:100vw!important;height:100dvh!important;background:#050409!important}
        .fl-room.${FOCUS_CLASS} .fl-topbar,.fl-room.${FOCUS_CLASS} .fl-sidepanel,.fl-room.${FOCUS_CLASS} .fl-native-layout-switcher{display:none!important}
        .fl-room.${FOCUS_CLASS} .fl-workspace,.fl-room.${FOCUS_CLASS} .fl-stage-wrap,.fl-room.${FOCUS_CLASS} .fl-stage-content,.fl-room.${FOCUS_CLASS} .fl-stage-video-area{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important;margin:0!important;padding:0!important;border-radius:0!important}
        .fl-room.${FOCUS_CLASS} .fl-screen-tile{width:100%!important;height:100%!important;border:0!important;border-radius:0!important;background:#000!important}
        .fl-room.${FOCUS_CLASS} .fl-screen-tile video{width:100%!important;height:100%!important;object-fit:contain!important;background:#000!important}
        .fl-room.${FOCUS_CLASS} .fl-presenter-pip{right:12px!important;bottom:88px!important;width:min(150px,34vw)!important;z-index:60!important}
        .fl-room.${FOCUS_CLASS} .fl-controls{position:fixed!important;left:50%!important;bottom:12px!important;transform:translateX(-50%)!important;z-index:70!important;max-width:calc(100vw - 20px)!important}
        @media(max-width:680px){
          .fl-screen-presentation-actions{right:8px;top:8px}
          .fl-screen-presentation-actions button{width:38px;height:38px;font-size:18px}
          .fl-room.${FOCUS_CLASS} .fl-presenter-pip{width:116px!important;bottom:82px!important}
        }
      `;
      document.head.appendChild(style);
    }

    const room = () => document.querySelector<HTMLElement>('.fl-room');

    const leaveFocus = () => {
      room()?.classList.remove(FOCUS_CLASS);
      document.querySelector<HTMLButtonElement>('.fl-screen-focus-button')?.classList.remove('active');
    };

    const enterFullscreen = async (tile: HTMLElement) => {
      try {
        if (tile.requestFullscreen) {
          await tile.requestFullscreen();
          return;
        }
        const video = tile.querySelector<HTMLVideoElement>('video') as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
        if (video?.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
          return;
        }
        room()?.classList.add(FOCUS_CLASS);
      } catch {
        room()?.classList.add(FOCUS_CLASS);
      }
    };

    const attachControls = () => {
      const tile = document.querySelector<HTMLElement>('.fl-screen-tile');
      if (!tile || tile.querySelector('.fl-screen-presentation-actions')) return;

      const actions = document.createElement('div');
      actions.className = 'fl-screen-presentation-actions';

      const focus = document.createElement('button');
      focus.type = 'button';
      focus.className = 'fl-screen-focus-button';
      focus.setAttribute('aria-label', 'Alternar modo apresentação');
      focus.title = 'Destacar apresentação';
      focus.textContent = '▣';
      focus.onclick = () => {
        const targetRoom = room();
        const next = !targetRoom?.classList.contains(FOCUS_CLASS);
        targetRoom?.classList.toggle(FOCUS_CLASS, next);
        focus.classList.toggle('active', next);
      };

      const fullscreen = document.createElement('button');
      fullscreen.type = 'button';
      fullscreen.setAttribute('aria-label', 'Ver apresentação em tela cheia');
      fullscreen.title = 'Tela cheia';
      fullscreen.textContent = '⛶';
      fullscreen.onclick = () => void enterFullscreen(tile);

      actions.append(focus, fullscreen);
      tile.appendChild(actions);
    };

    const observer = new MutationObserver(() => {
      attachControls();
      if (!document.querySelector('.fl-screen-tile')) leaveFocus();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    attachControls();

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        document.querySelector<HTMLButtonElement>('.fl-screen-presentation-actions button:last-child')?.blur();
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      observer.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      leaveFocus();
      if (original) mediaDevices.getDisplayMedia = original;
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
}
