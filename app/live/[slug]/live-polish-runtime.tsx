'use client';

import { useEffect } from 'react';

export default function LivePolishRuntime() {
  useEffect(() => {
    const sync = () => {
      const room = document.querySelector<HTMLElement>('.fl-room');
      if (!room) return;

      const split = room.classList.contains('offer-split-active');
      const banner = Boolean(room.querySelector('.fl-offer-banner'));
      const floating = Boolean(room.querySelector('.fl-offer-floating'));
      const mode = split ? 'split' : banner ? 'banner' : floating ? 'floating' : 'hidden';
      const desiredClass = `offer-mode-${mode}`;
      const modeClasses = ['offer-mode-split', 'offer-mode-banner', 'offer-mode-floating', 'offer-mode-hidden'];

      modeClasses.forEach((className) => room.classList.toggle(className, className === desiredClass));
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  return null;
}
