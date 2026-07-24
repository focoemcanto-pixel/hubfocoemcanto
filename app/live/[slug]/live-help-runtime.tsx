'use client';

import { useEffect, useState } from 'react';
import { CircleHelp, X } from 'lucide-react';

const CLASS_NAME = 'fl-live-help-trigger';

export default function LiveHelpRuntime() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const menu = document.querySelector<HTMLElement>('.fl-more-menu');
      if (!menu || menu.querySelector(`.${CLASS_NAME}`)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = CLASS_NAME;
      button.innerHTML = '<span class="fl-help-icon">?</span><div><b>Ajuda</b><small>Como usar os principais recursos da aula</small></div>';
      button.addEventListener('click', () => setOpen(true));
      menu.appendChild(button);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  if (!open) return null;
  return <div className="fl-live-help-backdrop" onPointerDown={() => setOpen(false)}>
    <section className="fl-live-help-modal" onPointerDown={(event) => event.stopPropagation()}>
      <header><div><small>FOCO LIVE</small><strong>Ajuda rápida</strong></div><button onClick={() => setOpen(false)}><X/></button></header>
      <article><CircleHelp/><div><b>Reações e mão levantada</b><p>Use “Reagir” para enviar emojis ou levantar a mão durante a aula.</p></div></article>
      <article><span>⋮</span><div><b>Menu Mais</b><p>Acesse Picture in Picture, tela cheia, visualização e configurações.</p></div></article>
      <article><span>▣</span><div><b>Picture in Picture</b><p>Mantenha o vídeo da aula flutuando enquanto navega em outra página.</p></div></article>
      <article><span>⌘</span><div><b>Professor</b><p>O dono da sala também recebe atalhos, notificações, Apps e Direção da aula.</p></div></article>
    </section>
  </div>;
}
