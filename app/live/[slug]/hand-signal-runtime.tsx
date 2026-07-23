'use client';

import { useEffect, useState } from 'react';
import { Hand, X } from 'lucide-react';

type RaisedHand = { id: string; name: string; raisedAt: number };
type HandMessage = { type: 'hand'; raised: boolean; name?: string; sessionId?: string };
type CallLike = {
  on?: (event: string, listener: (event: { data?: HandMessage; fromId?: string }) => void) => void;
  off?: (event: string, listener: (event: { data?: HandMessage; fromId?: string }) => void) => void;
};
type LiveWindow = Window & { __FOCO_LIVE_CALL__?: CallLike };

export default function HandSignalRuntime() {
  const [isHost, setIsHost] = useState(false);
  const [hands, setHands] = useState<Record<string, RaisedHand>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
  }, []);

  useEffect(() => {
    if (!isHost) return;

    let boundCall: CallLike | null = null;
    let disposed = false;

    const onMessage = (event: { data?: HandMessage; fromId?: string }) => {
      const data = event?.data;
      if (data?.type !== 'hand') return;

      const id = data.sessionId || event.fromId || data.name;
      if (!id) return;

      setHands((current) => {
        const next = { ...current };
        if (data.raised) {
          next[id] = {
            id,
            name: data.name?.trim() || 'Participante',
            raisedAt: current[id]?.raisedAt || Date.now(),
          };
        } else {
          delete next[id];
        }
        return next;
      });

      if (data.raised) setOpen(true);
    };

    const bindCurrentCall = () => {
      const call = (window as LiveWindow).__FOCO_LIVE_CALL__;
      if (!call?.on || call === boundCall) return;

      if (boundCall?.off) boundCall.off('app-message', onMessage);
      boundCall = call;
      boundCall.on('app-message', onMessage);
    };

    bindCurrentCall();

    // The Daily call object is created after the page runtimes mount. Keep this
    // lightweight watcher alive so reconnects and recreated call objects are rebound.
    const timer = window.setInterval(() => {
      if (!disposed) bindCurrentCall();
    }, 500);

    const onParticipantLeft = () => {
      // Remove stale entries whose participant is no longer present when possible.
      const call = (window as any).__FOCO_LIVE_CALL__;
      const participants = typeof call?.participants === 'function' ? call.participants() : null;
      if (!participants) return;
      const activeIds = new Set(Object.values(participants).map((participant: any) => participant?.session_id).filter(Boolean));
      setHands((current) => Object.fromEntries(Object.entries(current).filter(([id]) => activeIds.has(id))));
    };

    const participantTimer = window.setInterval(onParticipantLeft, 5000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.clearInterval(participantTimer);
      boundCall?.off?.('app-message', onMessage);
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
