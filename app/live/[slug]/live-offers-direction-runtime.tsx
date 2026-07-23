'use client';

import { useEffect } from 'react';

const CONTROL_CLASS = 'fl-offers-library-control';

export default function LiveOffersDirectionRuntime() {
  useEffect(() => {
    const isHost = new URLSearchParams(window.location.search).get('host') === '1';
    if (!isHost) return;

    const sync = () => {
      const panel = document.querySelector<HTMLElement>('.fl-director-panel');
      const offers = panel?.querySelector<HTMLElement>('.fl-director-offers');
      if (!panel || !offers || panel.querySelector(`.${CONTROL_CLASS}`)) return;

      offers.hidden = true;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = CONTROL_CLASS;
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = '<span aria-hidden="true">🛍️</span><span><strong>Ofertas</strong><small>Abrir biblioteca de ofertas cadastradas</small></span><b aria-hidden="true">›</b>';
      button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        offers.hidden = expanded;
        button.querySelector('b')!.textContent = expanded ? '›' : '⌄';
      });
      panel.insertBefore(button, offers);
    };

    const style = document.createElement('style');
    style.dataset.focoOffersDirection = 'true';
    style.textContent = `
      .${CONTROL_CLASS}{display:flex!important;width:100%;align-items:center;gap:10px;padding:13px 14px;margin:10px 0;border:1px solid rgba(124,58,237,.35);border-radius:12px;background:rgba(124,58,237,.12);color:inherit;text-align:left;cursor:pointer}
      .${CONTROL_CLASS}>span:first-child{font-size:20px}. ${CONTROL_CLASS}>span:nth-child(2){display:grid;gap:2px;flex:1}
      .${CONTROL_CLASS} strong{font-size:14px}. ${CONTROL_CLASS} small{font-size:11px;opacity:.72}. ${CONTROL_CLASS}>b{font-size:18px}
      .fl-director-offers[hidden]{display:none!important}
    `.replaceAll('. ', '.');
    document.head.appendChild(style);

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => {
      observer.disconnect();
      style.remove();
    };
  }, []);

  return null;
}
