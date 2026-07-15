'use client';

import { useEffect } from 'react';

export default function LivePolishRuntime() {
  useEffect(() => {
    let guestChatOpen = false;

    const sync = () => {
      const room = document.querySelector<HTMLElement>('.fl-room');
      if (!room) return;

      const split = Boolean(room.querySelector('.fl-offer-scene'));
      const banner = Boolean(room.querySelector('.fl-offer-banner'));
      const floating = Boolean(room.querySelector('.fl-offer-floating'));
      const mode = split ? 'split' : banner ? 'banner' : floating ? 'floating' : 'hidden';

      room.classList.remove('offer-mode-split', 'offer-mode-banner', 'offer-mode-floating', 'offer-mode-hidden');
      room.classList.add(`offer-mode-${mode}`);

      const offerButtons = room.querySelectorAll<HTMLButtonElement>('.fl-director-offers article button');
      offerButtons.forEach((button, index) => {
        const buttonMode = index % 3 === 0 ? 'split' : index % 3 === 1 ? 'banner' : 'floating';
        button.classList.toggle('active-offer-mode', mode === buttonMode);
        button.setAttribute('aria-pressed', String(mode === buttonMode));
      });

      if (mode === 'hidden') {
        room.querySelectorAll('.fl-director-offers article button').forEach((button) => button.classList.remove('active-offer-mode'));
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();

    const handleGuestChat = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const room = target?.closest('.fl-room');
      if (!room || room.classList.contains('host-studio')) return;

      const button = target?.closest('button');
      if (!button) return;
      const isMobileChatButton = button.matches('.fl-icon-button.mobile-only');
      const isFooterChatButton = button.closest('.fl-controls') && /chat/i.test(button.textContent || '');
      if (!isMobileChatButton && !isFooterChatButton) return;

      event.preventDefault();
      event.stopPropagation();
      guestChatOpen = !guestChatOpen;
      const panel = room.querySelector<HTMLElement>('.fl-sidepanel');
      panel?.classList.toggle('open', guestChatOpen);
    };

    document.addEventListener('click', handleGuestChat, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleGuestChat, true);
    };
  }, []);

  return null;
}
