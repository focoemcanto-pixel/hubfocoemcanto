'use client';

import { useEffect, useState } from 'react';

function bestVideo(room: HTMLElement) {
  const videos = Array.from(room.querySelectorAll<HTMLVideoElement>('video')).filter((video) => {
    const rect = video.getBoundingClientRect();
    return video.readyState >= 2 && rect.width > 120 && rect.height > 80 && !video.closest('.fl-piano-dock');
  });
  return videos.sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return br.width * br.height - ar.width * ar.height;
  })[0] || null;
}

export default function LivePipRuntime() {
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const show = (text: string) => {
      setNotice(text);
      window.setTimeout(() => setNotice(''), 3600);
    };

    const intercept = async (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('.fl-more-menu button');
      if (!button || !/picture in picture/i.test(button.textContent || '')) return;
      event.preventDefault();
      event.stopPropagation();
      (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();

      const room = document.querySelector<HTMLElement>('.fl-room');
      const pipDocument = document as Document & {
        pictureInPictureElement?: Element | null;
        pictureInPictureEnabled?: boolean;
        exitPictureInPicture?: () => Promise<void>;
      };

      try {
        if (pipDocument.pictureInPictureElement && pipDocument.exitPictureInPicture) {
          await pipDocument.exitPictureInPicture();
          show('Picture in Picture encerrado.');
          return;
        }
        if (!pipDocument.pictureInPictureEnabled) {
          show('Este navegador não permite Picture in Picture nesta página.');
          return;
        }
        const video = room ? bestVideo(room) : null;
        const request = (video as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> } | null)?.requestPictureInPicture;
        if (!video || !request) {
          show('Aguarde o vídeo carregar para abrir a janela flutuante.');
          return;
        }
        await request.call(video);
        show('A aula está em uma janela flutuante.');
      } catch {
        show('Não foi possível abrir a janela flutuante. Verifique a permissão do navegador.');
      }
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    };

    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, []);

  return notice ? <div className="fl-pip-notice" role="status">{notice}</div> : null;
}
