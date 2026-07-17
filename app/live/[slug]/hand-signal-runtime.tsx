'use client';

import { useEffect, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { Hand, X } from 'lucide-react';

type RaisedHand = { id: string; name: string; raisedAt: number };

export default function HandSignalRuntime() {
  const [isHost, setIsHost] = useState(false);
  const [hands, setHands] = useState<Record<string, RaisedHand>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
  }, []);

  useEffect(() => {
    if (!isHost) return;
    let call: any = null;
    let attempts = 0;
    const onMessage = (event: any) => {
      const data = event?.data;
      if (data?.type !== 'hand') return;
      const id = data.sessionId || event?.fromId || data.name;
      if (!id) return;
      setHands((current) => {
        const next = { ...current };
        if (data.raised) next[id] = { id, name: data.name || 'Participante', raisedAt: Date.now() };
        else delete next[id];
        return next;
      });
      if (data.raised) setOpen(true);
    };

    const bind = () => {
      call = (DailyIframe as any).getCallInstance?.();
      if (call?.on) {
        call.on('app-message', onMessage);
        return true;
      }
      return false;
    };

    if (bind()) return () => call?.off?.('app-message', onMessage);
    const timer = window.setInterval(() => {
      attempts += 1;
      if (bind() || attempts > 60) window.clearInterval(timer);
    }, 500);
    return () => {
      window.clearInterval(timer);
      call?.off?.('app-message', onMessage);
    };
  }, [isHost]);

  const list = Object.values(hands).sort((a, b) => a.raisedAt - b.raisedAt);
  if (!isHost || list.length === 0) return null;

  return <div className={`fl-hand-signal${open ? ' open' : ''}`}>
    <button className="fl-hand-summary" onClick={() => setOpen((value) => !value)} aria-label={`${list.length} mãos levantadas`}>
      <Hand size={19}/><b>{list.length}</b><span>{list.length === 1 ? 'mão levantada' : 'mãos levantadas'}</span>
    </button>
    {open && <section><header><strong>Pedidos de fala</strong><button onClick={() => setOpen(false)}><X size={16}/></button></header>{list.map((item, index) => <article key={item.id}><i>{index + 1}</i><div><b>{item.name}</b><small>Levantou a mão</small></div></article>)}</section>}
  </div>;
}
