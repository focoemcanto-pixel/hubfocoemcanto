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
    const publicUrl = new URL(`/live/${encodeURIComponent(slug)}`, window.location.origin).toString();

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
      document.querySelector('[data-runtime-toast]')?.remove();
      const toast = document.createElement('div');
      toast.dataset.runtimeToast = 'true';
      toast.className = 'fl-toast';
      toast.textContent = message;
      stage.appendChild(toast);
      window.setTimeout(() => toast.remove(), 2600);
    }

    async function copyPublicLink() {
      try {
        await navigator.clipboard.writeText(publicUrl);
        showToast('Link da live copiado!');
      } catch {
        const input = document.querySelector<HTMLInputElement>('[data-share-link-input]');
        input?.select();
        if (input) document.execCommand('copy');
        showToast('Link da live copiado!');
      }
    }

    function closeShareModal() {
      document.querySelector('[data-live-share-modal]')?.remove();
    }

    function openShareModal() {
      closeShareModal();
      const title = document.querySelector('.fl-brand.compact small')?.textContent?.trim() || 'Foco Live';
      const message = `🎙️ Você está convidado para a live “${title}” do Foco em Canto!\n\nEntre pelo link:\n${publicUrl}`;
      const whatsappUrl = new URL('https://wa.me/');
      whatsappUrl.searchParams.set('text', message);

      const overlay = document.createElement('div');
      overlay.dataset.liveShareModal = 'true';
      overlay.className = 'fl-share-overlay';
      overlay.innerHTML = `
        <section class="fl-share-modal" role="dialog" aria-modal="true" aria-label="Compartilhar live">
          <button type="button" class="fl-share-close" data-share-close aria-label="Fechar">×</button>
          <span>CONVIDAR PARTICIPANTES</span>
          <h2>Compartilhar live</h2>
          <p>Este é o link público para alunos e convidados. Ele não libera os controles do apresentador.</p>
          <div class="fl-share-link-row">
            <input data-share-link-input readonly value="${publicUrl.replace(/"/g, '&quot;')}" />
            <button type="button" data-share-copy>Copiar</button>
          </div>
          <div class="fl-share-actions">
            <button type="button" data-share-whatsapp>Enviar pelo WhatsApp</button>
            <button type="button" data-share-native>Mais opções</button>
          </div>
          <small>Link para convidados: sem <b>?host=1</b></small>
        </section>`;

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay || (event.target as HTMLElement).closest('[data-share-close]')) closeShareModal();
      });
      overlay.querySelector('[data-share-copy]')?.addEventListener('click', copyPublicLink);
      overlay.querySelector('[data-share-whatsapp]')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(whatsappUrl.toString(), '_blank', 'noopener,noreferrer');
      });
      overlay.querySelector('[data-share-native]')?.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!navigator.share) {
          await copyPublicLink();
          return;
        }
        try {
          await navigator.share({ title, text: `Você está convidado para a live “${title}” do Foco em Canto.`, url: publicUrl });
        } catch (error) {
          if ((error as Error)?.name !== 'AbortError') await copyPublicLink();
        }
      });

      document.body.appendChild(overlay);
      window.setTimeout(() => overlay.classList.add('visible'), 10);
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
      button.addEventListener('click', openShareModal);
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
      if (label) label.textContent = kind === 'audio' ? enabled ? 'Microfone' : 'Ativar mic' : enabled ? 'Câmera' : 'Ativar câmera';
      button.setAttribute('aria-pressed', String(enabled));
    }

    async function handleGuestMediaClick(event: MouseEvent) {
      if (isHostStudio()) return;
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.fl-controls > button');
      if (!button) return;
      const audioButton = mediaButton('audio');
      const videoButton = mediaButton('video');
      const kind = button === audioButton ? 'audio' : button === videoButton ? 'video' : null;
      if (!kind) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const call = window.__focoLiveCall;
      if (!call) return showToast('Aguarde a conexão da sala terminar.');
      if (window.__focoMediaLocks?.[kind]) return showToast(kind === 'audio' ? 'O apresentador bloqueou seu microfone.' : 'O apresentador bloqueou sua câmera.');
      try {
        const local = call.participants?.()?.local;
        const current = kind === 'audio' ? local?.audio !== false : local?.video !== false;
        const next = !current;
        if (kind === 'audio') await call.setLocalAudio(next);
        else await call.setLocalVideo(next);
        syncMediaButton(kind, next);
      } catch {
        showToast(kind === 'audio' ? 'Não foi possível acessar o microfone. Confira a permissão do navegador.' : 'Não foi possível acessar a câmera. Confira a permissão do navegador.');
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
      closeShareModal();
    };
  }, [slug]);

  return null;
}
