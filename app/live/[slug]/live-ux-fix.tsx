'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __focoLiveCall?: any;
    __focoMediaLocks?: { audio: boolean; video: boolean };
  }
}

export default function LiveUxFix({ slug }: { slug: string }) {
  useEffect(() => {
    const publicUrl = `${window.location.origin}/live/${slug}`;

    function isHostStudio() {
      return Boolean(document.querySelector('.host-studio, .host-entry'));
    }

    function closeMobilePanel() {
      if (window.matchMedia('(max-width: 980px)').matches) {
        document.querySelector('.fl-sidepanel')?.classList.remove('open');
      }
    }

    function showToast(message: string) {
      const stage = document.querySelector('.fl-stage-wrap') || document.body;
      const existing = document.querySelector('[data-runtime-toast]');
      existing?.remove();
      const toast = document.createElement('div');
      toast.dataset.runtimeToast = 'true';
      toast.className = 'fl-toast';
      toast.textContent = message;
      stage.appendChild(toast);
      window.setTimeout(() => toast.remove(), 2600);
    }

    function installShareButton() {
      const header = document.querySelector('.fl-topbar');
      if (!header || header.querySelector('[data-live-share]')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.liveShare = 'true';
      button.className = 'fl-share-live-button';
      button.innerHTML = '<span>Compartilhar</span>';
      button.setAttribute('aria-label', 'Compartilhar link da live');

      button.addEventListener('click', async () => {
        const shareData = {
          title: document.title || 'Foco Live',
          text: 'Você está convidado para esta live do Foco em Canto.',
          url: publicUrl,
        };

        try {
          if (navigator.share) {
            await navigator.share(shareData);
            return;
          }
          await navigator.clipboard.writeText(publicUrl);
          button.innerHTML = '<span>Link copiado!</span>';
          window.setTimeout(() => { button.innerHTML = '<span>Compartilhar</span>'; }, 1800);
        } catch {
          try {
            await navigator.clipboard.writeText(publicUrl);
            button.innerHTML = '<span>Link copiado!</span>';
            window.setTimeout(() => { button.innerHTML = '<span>Compartilhar</span>'; }, 1800);
          } catch {
            window.prompt('Copie o link para convidados:', publicUrl);
          }
        }
      });

      const status = header.querySelector('.fl-top-status');
      if (status) status.insertAdjacentElement('afterend', button);
      else header.appendChild(button);
    }

    function normalizeGuestExperience() {
      const isHostUrl = new URLSearchParams(window.location.search).get('host') === '1';
      if (!isHostUrl || !isHostStudio()) closeMobilePanel();

      document.querySelectorAll<HTMLAnchorElement>('a[href*="?host=1"]').forEach((anchor) => {
        if (anchor.closest('.host-studio')) return;
        anchor.href = publicUrl;
      });
    }

    function mediaButton(kind: 'audio' | 'video') {
      const controls = document.querySelector('.fl-controls');
      if (!controls) return null;
      const buttons = Array.from(controls.querySelectorAll<HTMLButtonElement>(':scope > button'));
      return kind === 'audio' ? buttons[0] || null : buttons[1] || null;
    }

    function syncMediaButton(kind: 'audio' | 'video', enabled: boolean) {
      const button = mediaButton(kind);
      if (!button) return;
      button.classList.toggle('off', !enabled);
      const label = button.querySelector('span');
      if (label) label.textContent = kind === 'audio'
        ? enabled ? 'Microfone' : 'Ativar mic'
        : enabled ? 'Câmera' : 'Ativar câmera';
      button.setAttribute('aria-pressed', String(enabled));
    }

    async function handleGuestMediaClick(event: MouseEvent) {
      if (isHostStudio()) return;
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('.fl-controls > button');
      if (!button) return;

      const audioButton = mediaButton('audio');
      const videoButton = mediaButton('video');
      const kind = button === audioButton ? 'audio' : button === videoButton ? 'video' : null;
      if (!kind) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const call = window.__focoLiveCall;
      if (!call) {
        showToast('Aguarde a conexão da sala terminar.');
        return;
      }

      const locked = Boolean(window.__focoMediaLocks?.[kind]);
      if (locked) {
        showToast(kind === 'audio'
          ? 'O apresentador bloqueou seu microfone.'
          : 'O apresentador bloqueou sua câmera.');
        return;
      }

      try {
        const local = call.participants?.()?.local;
        const current = kind === 'audio' ? local?.audio !== false : local?.video !== false;
        const next = !current;
        if (kind === 'audio') await call.setLocalAudio(next);
        else await call.setLocalVideo(next);
        syncMediaButton(kind, next);
      } catch {
        showToast(kind === 'audio'
          ? 'Não foi possível acessar o microfone. Confira a permissão do navegador.'
          : 'Não foi possível acessar a câmera. Confira a permissão do navegador.');
      }
    }

    const observer = new MutationObserver(() => {
      installShareButton();
      normalizeGuestExperience();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', handleGuestMediaClick, true);
    installShareButton();
    normalizeGuestExperience();

    const onResize = () => normalizeGuestExperience();
    window.addEventListener('resize', onResize);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleGuestMediaClick, true);
      window.removeEventListener('resize', onResize);
    };
  }, [slug]);

  return null;
}
