'use client';

import { useEffect } from 'react';
import { Copy, Share2 } from 'lucide-react';

export default function LiveUxFix({ slug }: { slug: string }) {
  useEffect(() => {
    const publicUrl = `${window.location.origin}/live/${slug}`;

    function closeMobilePanel() {
      if (window.matchMedia('(max-width: 980px)').matches) {
        document.querySelector('.fl-sidepanel')?.classList.remove('open');
      }
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
      const isHostStudio = Boolean(document.querySelector('.host-studio, .host-entry'));

      if (!isHostUrl || !isHostStudio) closeMobilePanel();

      document.querySelectorAll<HTMLAnchorElement>('a[href*="?host=1"]').forEach((anchor) => {
        if (anchor.closest('.host-studio')) return;
        anchor.href = publicUrl;
      });
    }

    const observer = new MutationObserver(() => {
      installShareButton();
      normalizeGuestExperience();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    installShareButton();
    normalizeGuestExperience();

    const onResize = () => normalizeGuestExperience();
    window.addEventListener('resize', onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [slug]);

  return null;
}
