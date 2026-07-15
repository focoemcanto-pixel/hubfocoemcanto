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
      const desiredClass = `offer-mode-${mode}`;
      const modeClasses = ['offer-mode-split', 'offer-mode-banner', 'offer-mode-floating', 'offer-mode-hidden'];

      // Make DOM writes idempotent. The previous version observed class changes and
      // rewrote the same classes inside its callback, creating a mutation loop as
      // soon as the room mounted.
      const currentModeClass = modeClasses.find((className) => room.classList.contains(className));
      if (currentModeClass !== desiredClass) {
        modeClasses.forEach((className) => {
          if (className !== desiredClass && room.classList.contains(className)) room.classList.remove(className);
        });
        if (!room.classList.contains(desiredClass)) room.classList.add(desiredClass);
      }

      const offerButtons = room.querySelectorAll<HTMLButtonElement>('.fl-director-offers article button');
      offerButtons.forEach((button, index) => {
        const buttonMode = index % 3 === 0 ? 'split' : index % 3 === 1 ? 'banner' : 'floating';
        const active = mode === buttonMode;
        if (button.classList.contains('active-offer-mode') !== active) {
          button.classList.toggle('active-offer-mode', active);
        }
        const pressed = String(active);
        if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      });
    };

    // Offer layouts change by mounting/unmounting elements. Watching childList is
    // enough and avoids observing the class updates performed by sync itself.
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
