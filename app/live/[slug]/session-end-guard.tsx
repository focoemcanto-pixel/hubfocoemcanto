'use client';

import { useEffect, useState } from 'react';

export default function SessionEndGuard({ initialStatus, title, slug }: { initialStatus: string; title: string; slug: string }) {
  const [ended, setEnded] = useState(initialStatus === 'ended');

  useEffect(() => {
    if (ended) return;

    let cancelled = false;
    const finish = () => { if (!cancelled) setEnded(true); };
    window.addEventListener('foco-live-ended', finish);

    const observer = new MutationObserver(() => {
      const text = document.querySelector('.fl-top-status')?.textContent || '';
      if (text.includes('ENCERRADA')) finish();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/live/${encodeURIComponent(slug)}/control`, { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.ended || payload?.status === 'ended') finish();
      } catch {
        // A próxima consulta tenta novamente. A tela não deve quebrar por falha transitória.
      }
    };

    void checkStatus();
    const pollTimer = window.setInterval(() => { void checkStatus(); }, 1500);

    return () => {
      cancelled = true;
      window.removeEventListener('foco-live-ended', finish);
      observer.disconnect();
      window.clearInterval(pollTimer);
    };
  }, [ended, slug]);

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
