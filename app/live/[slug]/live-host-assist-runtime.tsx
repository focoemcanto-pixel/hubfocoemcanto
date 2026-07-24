'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Bell, BellOff, ChevronDown, ChevronUp, KeyboardMusic, PenTool, Settings2, ShoppingBag, TimerReset, X } from 'lucide-react';

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };
type Toast = { id: string; text: string; icon: string };
type Preferences = { joins: boolean; leaves: boolean; hands: boolean; reactions: boolean };
type ReactionMessage = { type: 'foco-reaction'; emoji?: string; name?: string };
type HandMessage = { type: 'hand'; raised?: boolean; name?: string };
type QuickTool = 'piano' | 'board' | 'timer' | 'poll' | 'offers';

const PREF_KEY = 'foco-live-host-notification-preferences';
const DEFAULT_PREFS: Preferences = { joins: true, leaves: true, hands: true, reactions: true };
const TOOL_EVENTS: Partial<Record<QuickTool, string>> = {
  piano: 'foco-piano-toggle',
  board: 'foco-board-toggle',
  timer: 'foco-timer-toggle',
  poll: 'foco-poll-toggle',
};

function directionButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.fl-controls button')).find((item) => /direção|direcao/i.test(item.textContent || '')) || null;
}

function closeTool(tool: QuickTool) {
  const selectors: Partial<Record<QuickTool, string>> = {
    piano: '.fl-piano-dock header button:last-child',
    board: '.fl-studio-scene .fl-scene-toolbar button.icon',
    timer: '.fl-live-timer header button:last-child',
    poll: '.fl-live-poll header button:last-child',
  };
  if (tool === 'offers') {
    document.querySelector<HTMLButtonElement>('.fl-director-offers.fl-offers-expanded .fl-offers-toggle')?.click();
    window.setTimeout(() => directionButton()?.click(), 40);
    return;
  }
  const selector = selectors[tool];
  if (selector) document.querySelector<HTMLButtonElement>(selector)?.click();
}

function detectOpenTool(): QuickTool | null {
  if (document.querySelector('.fl-live-poll')) return 'poll';
  if (document.querySelector('.fl-live-timer')) return 'timer';
  if (document.querySelector('.fl-studio-scene.app-board')) return 'board';
  if (document.querySelector('.fl-piano-dock')) return 'piano';
  if (document.querySelector('.fl-director-offers.fl-offers-expanded')) return 'offers';
  return null;
}

export default function LiveHostAssistRuntime() {
  const [isHost, setIsHost] = useState(false);
  const [ready, setReady] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<QuickTool | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFS);
  const attachedCallRef = useRef<any>(null);

  const stage = ready ? document.querySelector<HTMLElement>('.fl-room') : null;
  const controls = ready ? document.querySelector<HTMLElement>('.fl-room .fl-controls') : null;
  const reactionTotal = useMemo(() => Object.values(reactionCounts).reduce((sum, value) => sum + value, 0), [reactionCounts]);

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    try {
      const saved = window.localStorage.getItem(PREF_KEY);
      if (saved) setPreferences({ ...DEFAULT_PREFS, ...JSON.parse(saved) });
    } catch {}
    const sync = () => setReady(Boolean(document.querySelector('.fl-room') && document.querySelector('.fl-room .fl-controls')));
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isHost) return;
    const syncTool = () => setActiveTool(detectOpenTool());
    const observer = new MutationObserver(syncTool);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const timer = window.setInterval(syncTool, 350);
    syncTool();
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, [isHost]);

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

  if (!isHost || !ready || !stage || !controls) return null;

  const openOffers = () => {
    const panelAlreadyOpen = Boolean(document.querySelector('.fl-sidepanel.open .fl-director-offers'));
    if (!panelAlreadyOpen) directionButton()?.click();
    window.setTimeout(() => {
      const offers = document.querySelector<HTMLElement>('.fl-director-offers');
      const toggle = offers?.querySelector<HTMLButtonElement>('.fl-offers-toggle');
      if (offers && !offers.classList.contains('fl-offers-expanded')) toggle?.click();
      setActiveTool('offers');
    }, panelAlreadyOpen ? 20 : 120);
  };

  const toggleTool = (tool: QuickTool) => {
    const actuallyOpen = detectOpenTool();
    if (actuallyOpen === tool || activeTool === tool) {
      closeTool(tool);
      setActiveTool(null);
      return;
    }
    if (actuallyOpen) closeTool(actuallyOpen);
    window.setTimeout(() => {
      if (tool === 'offers') openOffers();
      else {
        const eventName = TOOL_EVENTS[tool];
        if (eventName) window.dispatchEvent(new Event(eventName));
        setActiveTool(tool);
      }
    }, actuallyOpen ? 90 : 0);
  };

  const togglePreference = (key: keyof Preferences) => setPreferences((current) => ({ ...current, [key]: !current[key] }));

  return <>
    {createPortal(<button type="button" className={`fl-host-dock-trigger${dockOpen ? ' active' : ''}`} onClick={() => { setDockOpen((value) => !value); setSettingsOpen(false); }} aria-label={dockOpen ? 'Esconder atalhos da aula' : 'Mostrar atalhos da aula'} title={dockOpen ? 'Esconder atalhos' : 'Mostrar atalhos'}>{dockOpen ? <ChevronDown /> : <ChevronUp />}<span>Atalhos</span></button>, controls, 'foco-host-dock-trigger')}

    <aside className={`fl-host-quick-dock${dockOpen ? ' open' : ''}`} aria-label="Atalhos rápidos da aula" aria-hidden={!dockOpen}>
      <button className={activeTool === 'piano' ? 'active' : ''} onClick={() => toggleTool('piano')} title="Foco Keys"><KeyboardMusic/><span>Piano</span></button>
      <button className={activeTool === 'board' ? 'active' : ''} onClick={() => toggleTool('board')} title="Foco Board"><PenTool/><span>Board</span></button>
      <button className={activeTool === 'timer' ? 'active' : ''} onClick={() => toggleTool('timer')} title="Timer"><TimerReset/><span>Timer</span></button>
      <button className={activeTool === 'poll' ? 'active' : ''} onClick={() => toggleTool('poll')} title="Enquete"><BarChart3/><span>Enquete</span></button>
      <button className={activeTool === 'offers' ? 'active' : ''} onClick={() => toggleTool('offers')} title="Ofertas"><ShoppingBag/><span>Ofertas</span></button>
      <i />
      <button className="summary" title={`${reactionTotal} reações`}><span className="emoji">✨</span><b>{reactionTotal}</b></button>
      <button className={settingsOpen ? 'active' : ''} onClick={() => setSettingsOpen((value) => !value)} title="Notificações"><Settings2/><span>Avisos</span></button>
    </aside>

    {settingsOpen && dockOpen && <section className="fl-host-notification-settings">
      <header><div><small>FOCO LIVE</small><strong>Notificações da aula</strong></div><button onClick={() => setSettingsOpen(false)}><X/></button></header>
      {([['joins','Mostrar quem entrou'],['leaves','Mostrar quem saiu'],['hands','Mostrar mãos levantadas'],['reactions','Mostrar reações']] as [keyof Preferences,string][]).map(([key,label]) => <button key={key} className={preferences[key] ? 'enabled' : ''} onClick={() => togglePreference(key)}>{preferences[key] ? <Bell/> : <BellOff/>}<span>{label}</span><i /></button>)}
      <div className="reaction-summary"><b>Reações nesta sessão</b><div>{Object.entries(reactionCounts).length ? Object.entries(reactionCounts).map(([emoji,count]) => <span key={emoji}>{emoji} {count}</span>) : <small>Nenhuma reação ainda</small>}</div></div>
    </section>}

    <div className="fl-host-toasts">{toasts.map((toast) => <article key={toast.id}><span>{toast.icon}</span><b>{toast.text}</b></article>)}</div>
  </>;
}
