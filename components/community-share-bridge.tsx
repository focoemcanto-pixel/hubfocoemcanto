'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

function postIdFromButton(button: HTMLButtonElement) {
  const article = button.closest<HTMLElement>('article[id^="post-"]');
  return article?.id.replace(/^post-/, '') || null;
}

function isMenuShareButton(button: HTMLButtonElement) {
  return Boolean(button.closest('.post-options-popover')) && button.textContent?.toLowerCase().includes('compartilhar');
}

function isFeedShareButton(button: HTMLButtonElement) {
  const actionRow = button.closest('.instagram-action-left');
  if (!actionRow) return false;

  const buttons = Array.from(actionRow.querySelectorAll('button'));
  return buttons.indexOf(button) === 2;
}

function buildPostUrl(postId: string) {
  return `${window.location.origin}/aluno/comunidade#post-${postId}`;
}

export function CommunityShareBridge() {
  const [toast, setToast] = useState('');

  useEffect(() => {
    let timeout: number | null = null;

    function showToast(message: string) {
      setToast(message);
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setToast(''), 2200);
    }

    async function copyPostLink(url: string) {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponível.');
      await navigator.clipboard.writeText(url);
      showToast('Link copiado.');
    }

    async function sharePost(postId: string) {
      const url = buildPostUrl(postId);
      const title = 'Publicação da Comunidade VIP';

      try {
        if (navigator.share) {
          await navigator.share({ title, url });
          return;
        }

        await copyPostLink(url);
      } catch {
        try {
          await copyPostLink(url);
        } catch {
          showToast('Não foi possível compartilhar. Copie o link pela barra do navegador.');
        }
      }
    }

    function handleClick(event: MouseEvent) {
      const button = (event.target as Element | null)?.closest?.('button') as HTMLButtonElement | null;
      if (!button) return;
      if (!isMenuShareButton(button) && !isFeedShareButton(button)) return;

      const postId = postIdFromButton(button);
      if (!postId) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void sharePost(postId);
    }

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  return toast ? <div className="instagram-toast"><CheckCircle2 size={17} /> {toast}</div> : null;
}
