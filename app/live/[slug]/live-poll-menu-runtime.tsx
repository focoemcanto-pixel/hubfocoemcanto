'use client';

import { useEffect } from 'react';

const CLASS_NAME = 'fl-poll-app-trigger';

export default function LivePollMenuRuntime() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('host') !== '1') return;
    const sync = () => {
      const list = document.querySelector<HTMLElement>('.fl-tools-popover.panel-apps .fl-tools-list');
      if (!list || list.querySelector(`.${CLASS_NAME}`)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = CLASS_NAME;
      button.innerHTML = '<span class="fl-poll-menu-icon" aria-hidden="true">▥</span><div><b>Enquete</b><small>Perguntas e votação ao vivo com a turma</small></div><i>›</i>';
      button.addEventListener('click', () => {
        window.dispatchEvent(new Event('foco-poll-toggle'));
        document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });
      const timerButton = Array.from(list.querySelectorAll('button')).find(item => item.textContent?.includes('Timer'));
      if (timerButton?.nextSibling) list.insertBefore(button, timerButton.nextSibling); else list.appendChild(button);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);
  return null;
}
