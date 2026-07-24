'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, Eye, EyeOff, Pause, Play, RotateCcw, TimerReset, X } from 'lucide-react';

type TimerMode = 'countdown' | 'stopwatch';
type TimerMessage = {
  type: 'foco-live-timer';
  open: boolean;
  mode: TimerMode;
  running: boolean;
  durationMs: number;
  elapsedMs: number;
  startedAt: number | null;
  visibleToClass: boolean;
};
type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };

const DEFAULT_DURATION = 5 * 60 * 1000;

function currentElapsed(state: TimerMessage, now = Date.now()) {
  return state.elapsedMs + (state.running && state.startedAt ? Math.max(0, now - state.startedAt) : 0);
}

function displayValue(state: TimerMessage, now: number) {
  const elapsed = currentElapsed(state, now);
  return state.mode === 'countdown' ? Math.max(0, state.durationMs - elapsed) : elapsed;
}

function formatTime(milliseconds: number) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function LiveTimerRuntime() {
  const [roomReady, setRoomReady] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [state, setState] = useState<TimerMessage>({
    type: 'foco-live-timer', open: false, mode: 'countdown', running: false,
    durationMs: DEFAULT_DURATION, elapsedMs: 0, startedAt: null, visibleToClass: false,
  });
  const callRef = useRef<any>(null);
  const root = roomReady ? document.querySelector('.fl-room') : null;

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    const sync = () => {
      setRoomReady(Boolean(document.querySelector('.fl-room')));
      callRef.current = (window as LiveWindow).__FOCO_LIVE_CALL__ || callRef.current;
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(sync, 500);
    sync();
    return () => { observer.disconnect(); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const openTimer = () => setOpen(true);
    window.addEventListener('foco-timer-toggle', openTimer);
    return () => window.removeEventListener('foco-timer-toggle', openTimer);
  }, []);

  useEffect(() => {
    let attached: any = null;
    const onMessage = (event: any) => {
      const data = event?.data as TimerMessage | undefined;
      if (data?.type !== 'foco-live-timer' || isHost) return;
      setState(data);
      setOpen(Boolean(data.open && data.visibleToClass));
    };
    const bind = () => {
      const call = (window as LiveWindow).__FOCO_LIVE_CALL__;
      if (!call || call === attached) return;
      attached?.off?.('app-message', onMessage);
      attached = call;
      attached.on?.('app-message', onMessage);
    };
    bind();
    const timer = window.setInterval(bind, 500);
    return () => { window.clearInterval(timer); attached?.off?.('app-message', onMessage); };
  }, [isHost]);

  useEffect(() => {
    if (!state.running) return;
    const timer = window.setInterval(() => {
      const stamp = Date.now();
      setNow(stamp);
      if (state.mode === 'countdown' && displayValue(state, stamp) <= 0) {
        setState(current => ({ ...current, running: false, elapsedMs: current.durationMs, startedAt: null }));
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [state]);

  const value = useMemo(() => displayValue(state, now), [state, now]);
  const finished = state.mode === 'countdown' && value <= 0;

  function publish(next: TimerMessage) {
    setState(next);
    if (next.visibleToClass) callRef.current?.sendAppMessage?.(next, '*');
  }

  function patch(update: Partial<TimerMessage>, broadcast = true) {
    const next = { ...state, ...update };
    setState(next);
    if (broadcast && next.visibleToClass) callRef.current?.sendAppMessage?.(next, '*');
  }

  function toggleRunning() {
    if (state.running) {
      const elapsedMs = currentElapsed(state);
      patch({ running: false, elapsedMs, startedAt: null });
    } else {
      const elapsedMs = finished ? 0 : state.elapsedMs;
      patch({ running: true, elapsedMs, startedAt: Date.now() });
    }
  }

  function reset() {
    patch({ running: false, elapsedMs: 0, startedAt: null });
    setNow(Date.now());
  }

  function setMinutes(minutes: number) {
    patch({ mode: 'countdown', durationMs: minutes * 60 * 1000, elapsedMs: 0, running: false, startedAt: null });
  }

  function toggleVisibility() {
    const visibleToClass = !state.visibleToClass;
    const next = { ...state, open: visibleToClass, visibleToClass };
    setState(next);
    callRef.current?.sendAppMessage?.(next, '*');
  }

  function close() {
    setOpen(false);
    if (isHost && state.visibleToClass) {
      const next = { ...state, open: false };
      setState(next);
      callRef.current?.sendAppMessage?.(next, '*');
    }
  }

  if (!root || !open) return null;

  return createPortal(<section className={`fl-live-timer${finished ? ' finished' : ''}${!isHost ? ' viewer' : ''}`}>
    <header><div><small>FOCO LIVE</small><strong><Clock3 size={18}/> Timer da aula</strong></div><button onClick={close}><X size={18}/></button></header>
    {isHost && <div className="fl-timer-mode"><button className={state.mode === 'countdown' ? 'active' : ''} onClick={() => patch({ mode:'countdown', running:false, elapsedMs:0, startedAt:null })}>Contagem regressiva</button><button className={state.mode === 'stopwatch' ? 'active' : ''} onClick={() => patch({ mode:'stopwatch', running:false, elapsedMs:0, startedAt:null })}>Cronômetro</button></div>}
    <div className="fl-timer-display"><span>{finished ? 'TEMPO!' : formatTime(value)}</span><small>{state.mode === 'countdown' ? 'Tempo restante' : 'Tempo decorrido'}</small></div>
    {isHost && <>
      {state.mode === 'countdown' && <div className="fl-timer-presets">{[1,3,5,10,15,20,30].map(minutes => <button key={minutes} onClick={() => setMinutes(minutes)}>{minutes} min</button>)}</div>}
      <div className="fl-timer-actions"><button className="primary" onClick={toggleRunning}>{state.running ? <Pause/> : <Play/>}{state.running ? 'Pausar' : 'Iniciar'}</button><button onClick={reset}><RotateCcw/> Reiniciar</button></div>
      <button className={`fl-timer-share${state.visibleToClass ? ' active' : ''}`} onClick={toggleVisibility}>{state.visibleToClass ? <EyeOff/> : <Eye/>}{state.visibleToClass ? 'Ocultar da turma' : 'Exibir para a turma'}</button>
    </>}
    {!isHost && <div className="fl-timer-viewer-note"><TimerReset size={16}/> Timer controlado pelo professor</div>}
  </section>, root);
}
