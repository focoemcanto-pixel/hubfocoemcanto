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

function shareText(button: HTMLButtonElement, url: string) {
  const article = button.closest<HTMLElement>('article[id^="post-"]');
  const exercise = article?.querySelector('.instagram-music-chip')?.textContent?.replace(/^♪\s*/, '').trim();
  const caption = article?.querySelector('.community-text-main')?.textContent?.trim();
  const base = exercise ? `Olha essa prática vocal na Comunidade VIP: ${exercise}` : 'Olha essa publicação da Comunidade VIP Foco em Canto';
  const preview = caption ? `\n\n${caption.slice(0, 120)}${caption.length > 120 ? '...' : ''}` : '';
  return `${base}${preview}\n\n${url}`;
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

    async function copyPostLink(text: string) {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponível.');
      await navigator.clipboard.writeText(text);
      showToast('Mensagem copiada.');
    }

    async function sharePost(postId: string, button: HTMLButtonElement) {
      const url = buildPostUrl(postId);
      const title = 'Comunidade VIP Foco em Canto';
      const text = shareText(button, url);

      try {
        if (navigator.share) {
          await navigator.share({ title, text });
          return;
        }

        await copyPostLink(text);
      } catch {
        try {
          await copyPostLink(text);
        } catch {
          showToast('Não foi possível compartilhar.');
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
      void sharePost(postId, button);
    }

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  return toast ? <div className="instagram-toast"><CheckCircle2 size={17} /> {toast}</div> : null;
}
