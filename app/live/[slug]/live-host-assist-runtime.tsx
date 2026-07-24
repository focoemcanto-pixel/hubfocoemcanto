'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Bell, BellOff, KeyboardMusic, PenTool, Settings2, TimerReset, X } from 'lucide-react';

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };
type Toast = { id: string; text: string; icon: string };
type Preferences = { joins: boolean; leaves: boolean; hands: boolean; reactions: boolean };
type ReactionMessage = { type: 'foco-reaction'; emoji?: string; name?: string };
type HandMessage = { type: 'hand'; raised?: boolean; name?: string };

const PREF_KEY = 'foco-live-host-notification-preferences';
const DEFAULT_PREFS: Preferences = { joins: true, leaves: true, hands: true, reactions: true };

export default function LiveHostAssistRuntime() {
  const [isHost, setIsHost] = useState(false);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS);
  const attachedCallRef = useRef<any>(null);

  const stage = ready ? document.querySelector<HTMLElement>('.fl-room') : null;
  const reactionTotal = useMemo(() => Object.values(reactionCounts).reduce((sum, value) => sum + value, 0), [reactionCounts]);

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    try {
      const saved = window.localStorage.getItem(PREF_KEY);
      if (saved) setPreferences({ ...DEFAULT_PREFS, ...JSON.parse(saved) });
    } catch {}
    const sync = () => setReady(Boolean(document.querySelector('.fl-room')));
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isHost) return;
    try { window.localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); } catch {}
  }, [isHost, preferences]);

  useEffect(() => {
    if (!isHost) return;
    let disposed = false;

    const notify = (text: string, icon: string) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current.slice(-3), { id, text, icon }]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3600);
    };

    const participantName = (event: any) => event?.participant?.user_name || event?.participant?.userName || 'Participante';
    const onJoined = (event: any) => { if (preferences.joins) notify(`${participantName(event)} entrou na aula`, '👋'); };
    const onLeft = (event: any) => { if (preferences.leaves) notify(`${participantName(event)} saiu da aula`, '↗'); };
    const onMessage = (event: any) => {
      const data = event?.data as ReactionMessage | HandMessage | undefined;
      if (data?.type === 'foco-reaction' && data.emoji) {
        setReactionCounts((current) => ({ ...current, [data.emoji!]: (current[data.emoji!] || 0) + 1 }));
        if (preferences.reactions) notify(`${data.name || 'Participante'} reagiu ${data.emoji}`, data.emoji);
      }
      if (data?.type === 'hand' && data.raised && preferences.hands) notify(`${data.name || 'Participante'} levantou a mão`, '✋');
    };

    const bind = () => {
      const call = (window as LiveWindow).__FOCO_LIVE_CALL__;
      if (!call || call === attachedCallRef.current) return;
      attachedCallRef.current?.off?.('participant-joined', onJoined);
      attachedCallRef.current?.off?.('participant-left', onLeft);
      attachedCallRef.current?.off?.('app-message', onMessage);
      attachedCallRef.current = call;
      call.on?.('participant-joined', onJoined);
      call.on?.('participant-left', onLeft);
      call.on?.('app-message', onMessage);
    };

    bind();
    const timer = window.setInterval(() => { if (!disposed) bind(); }, 500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      attachedCallRef.current?.off?.('participant-joined', onJoined);
      attachedCallRef.current?.off?.('participant-left', onLeft);
      attachedCallRef.current?.off?.('app-message', onMessage);
    };
  }, [isHost, preferences]);

  if (!isHost || !ready || !stage) return null;

  const open = (eventName: string) => window.dispatchEvent(new Event(eventName));
  const togglePreference = (key: keyof Preferences) => setPreferences((current) => ({ ...current, [key]: !current[key] }));

  return <>
    <aside className="fl-host-quick-dock" aria-label="Atalhos rápidos da aula">
      <button onClick={() => open('foco-piano-toggle')} title="Foco Keys"><KeyboardMusic/><span>Piano</span></button>
      <button onClick={() => open('foco-board-toggle')} title="Foco Board"><PenTool/><span>Board</span></button>
      <button onClick={() => open('foco-timer-toggle')} title="Timer"><TimerReset/><span>Timer</span></button>
      <button onClick={() => open('foco-poll-toggle')} title="Enquete"><BarChart3/><span>Enquete</span></button>
      <i />
      <button className="summary" title={`${reactionTotal} reações`}><span className="emoji">✨</span><b>{reactionTotal}</b></button>
      <button className={settingsOpen ? 'active' : ''} onClick={() => setSettingsOpen((value) => !value)} title="Notificações"><Settings2/><span>Avisos</span></button>
    </aside>

    {settingsOpen && <section className="fl-host-notification-settings">
      <header><div><small>FOCO LIVE</small><strong>Notificações da aula</strong></div><button onClick={() => setSettingsOpen(false)}><X/></button></header>
      {([
        ['joins','Mostrar quem entrou'],
        ['leaves','Mostrar quem saiu'],
        ['hands','Mostrar mãos levantadas'],
        ['reactions','Mostrar reações']
      ] as [keyof Preferences,string][]).map(([key,label]) => <button key={key} className={preferences[key] ? 'enabled' : ''} onClick={() => togglePreference(key)}>{preferences[key] ? <Bell/> : <BellOff/>}<span>{label}</span><i /></button>)}
      <div className="reaction-summary"><b>Reações nesta sessão</b><div>{Object.entries(reactionCounts).length ? Object.entries(reactionCounts).map(([emoji,count]) => <span key={emoji}>{emoji} {count}</span>) : <small>Nenhuma reação ainda</small>}</div></div>
    </section>}

    <div className="fl-host-toasts">{toasts.map((toast) => <article key={toast.id}><span>{toast.icon}</span><b>{toast.text}</b></article>)}</div>
  </>;
}
