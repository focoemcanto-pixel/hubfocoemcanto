'use client';

import { useEffect, useState } from 'react';

export default function SessionEndGuard({ initialStatus, title }: { initialStatus: string; title: string }) {
  const [ended, setEnded] = useState(initialStatus === 'ended');

  useEffect(() => {
    const finish = () => setEnded(true);
    window.addEventListener('foco-live-ended', finish);

    const observer = new MutationObserver(() => {
      const text = document.querySelector('.fl-top-status')?.textContent || '';
      if (text.includes('ENCERRADA')) setEnded(true);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      window.removeEventListener('foco-live-ended', finish);
      observer.disconnect();
    };
  }, []);

  if (!ended) return null;

  const hostMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('host') === '1';

  return (
    <div className="fl-session-ended" role="dialog" aria-modal="true">
      <section>
        <div className="fl-session-ended-logo">F</div>
        <span>TRANSMISSÃO FINALIZADA</span>
        <h1>A aula foi encerrada</h1>
        <p><strong>{title}</strong> chegou ao fim.</p>
        <a href={hostMode ? '/admin/foco-live' : '/'}>{hostMode ? 'Voltar ao Foco Live' : 'Sair da aula'}</a>
      </section>
    </div>
  );
}
