'use client';

import { useEffect } from 'react';

export default function LivePolishRuntime() {
  useEffect(() => {
    let guestChatOpen = false;

    const sync = () => {
      const room = document.querySelector<HTMLElement>('.fl-room');
      if (!room) return;

      const split = room.classList.contains('offer-split-active');
      const banner = Boolean(room.querySelector('.fl-offer-banner'));
      const floating = Boolean(room.querySelector('.fl-offer-floating'));
      const mode = split ? 'split' : banner ? 'banner' : floating ? 'floating' : 'hidden';
      const desiredClass = `offer-mode-${mode}`;
      const modeClasses = ['offer-mode-split', 'offer-mode-banner', 'offer-mode-floating', 'offer-mode-hidden'];

      const currentModeClass = modeClasses.find((className) => room.classList.contains(className));
      if (currentModeClass !== desiredClass) {
        modeClasses.forEach((className) => {
          if (className !== desiredClass && room.classList.contains(className)) room.classList.remove(className);
        });
        if (!room.classList.contains(desiredClass)) room.classList.add(desiredClass);
      }

      // O estado visual dos botões de oferta pertence ao React em FocoLiveRoom.
      // Não alteramos active-offer-mode pelo DOM, porque isso acendia o mesmo
      // modo em todas as ofertas ao mesmo tempo.
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
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
