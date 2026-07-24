'use client';

import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, Eye, EyeOff, GripHorizontal, Pause, Play, RotateCcw, TimerReset, X } from 'lucide-react';

type TimerMode = 'countdown' | 'stopwatch';
type TimerPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
type TimerMessage = {
  type: 'foco-live-timer';
  open: boolean;
  mode: TimerMode;
  running: boolean;
  durationMs: number;
  elapsedMs: number;
  startedAt: number | null;
  visibleToClass: boolean;
  position: TimerPosition;
  customX: number;
  customY: number;
};
type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };

type DragState = { pointerId: number; offsetX: number; offsetY: number };

const DEFAULT_DURATION = 5 * 60 * 1000;
const DEFAULT_STATE: TimerMessage = {
  type: 'foco-live-timer', open: false, mode: 'countdown', running: false,
  durationMs: DEFAULT_DURATION, elapsedMs: 0, startedAt: null, visibleToClass: false,
  position: 'center', customX: 50, customY: 50,
};

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
  const [state, setState] = useState<TimerMessage>(DEFAULT_STATE);
  const callRef = useRef<any>(null);
  const dragRef = useRef<DragState | null>(null);
  const root = roomReady ? document.querySelector<HTMLElement>('.fl-room') : null;
  const stage = roomReady ? document.querySelector<HTMLElement>('.fl-stage-wrap') : null;

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
      const data = event?.data as Partial<TimerMessage> | undefined;
      if (data?.type !== 'foco-live-timer' || isHost) return;
      setState(current => ({ ...current, ...data }));
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
  const overlayVisible = state.visibleToClass;

  function send(next: TimerMessage) {
    callRef.current?.sendAppMessage?.(next, '*');
  }

  function patch(update: Partial<TimerMessage>, broadcast = true) {
    const next = { ...state, ...update };
    setState(next);
    if (broadcast && next.visibleToClass) send(next);
  }

  function toggleRunning() {
    if (state.running) {
      patch({ running: false, elapsedMs: currentElapsed(state), startedAt: null });
    } else {
      patch({ running: true, elapsedMs: finished ? 0 : state.elapsedMs, startedAt: Date.now() });
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
    const next = { ...state, open: true, visibleToClass };
    setState(next);
    send(next);
  }

  function setPosition(position: TimerPosition) {
    const coordinates: Record<Exclude<TimerPosition, 'custom'>, [number, number]> = {
      center: [50, 50], 'top-left': [12, 14], 'top-right': [88, 14],
      'bottom-left': [12, 86], 'bottom-right': [88, 86],
    };
    const [customX, customY] = position === 'custom' ? [state.customX, state.customY] : coordinates[position];
    patch({ position, customX, customY });
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isHost || !stage) return;
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    const card = event.currentTarget;
    const cardRect = card.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - cardRect.left, offsetY: event.clientY - cardRect.top };
    card.setPointerCapture(event.pointerId);
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    const card = event.currentTarget.getBoundingClientRect();
    const left = Math.max(0, Math.min(rect.width - card.width, event.clientX - rect.left - active.offsetX));
    const top = Math.max(0, Math.min(rect.height - card.height, event.clientY - rect.top - active.offsetY));
    const customX = ((left + card.width / 2) / rect.width) * 100;
    const customY = ((top + card.height / 2) / rect.height) * 100;
    const next = { ...state, position: 'custom' as const, customX, customY };
    setState(next);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (state.visibleToClass) send(state);
  }

  function closeController() { setOpen(false); }

  if (!root) return null;

  const controller = open && isHost ? <section className={`fl-live-timer${finished ? ' finished' : ''}`}>
    <header><div><small>FOCO LIVE</small><strong><Clock3 size={18}/> Timer da aula</strong></div><button onClick={closeController}><X size={18}/></button></header>
    <div className="fl-timer-mode"><button className={state.mode === 'countdown' ? 'active' : ''} onClick={() => patch({ mode:'countdown', running:false, elapsedMs:0, startedAt:null })}>Contagem regressiva</button><button className={state.mode === 'stopwatch' ? 'active' : ''} onClick={() => patch({ mode:'stopwatch', running:false, elapsedMs:0, startedAt:null })}>Cronômetro</button></div>
    <div className="fl-timer-display"><span>{finished ? 'TEMPO!' : formatTime(value)}</span><small>{state.mode === 'countdown' ? 'Tempo restante' : 'Tempo decorrido'}</small></div>
    {state.mode === 'countdown' && <div className="fl-timer-presets">{[1,3,5,10,15,20,30].map(minutes => <button key={minutes} onClick={() => setMinutes(minutes)}>{minutes} min</button>)}</div>}
    <div className="fl-timer-actions"><button className="primary" onClick={toggleRunning}>{state.running ? <Pause/> : <Play/>}{state.running ? 'Pausar' : 'Iniciar'}</button><button onClick={reset}><RotateCcw/> Reiniciar</button></div>
    <div className="fl-timer-position"><span>Posição na apresentação</span><div>{(['top-left','top-right','center','bottom-left','bottom-right'] as TimerPosition[]).map(position => <button key={position} className={state.position === position ? `active ${position}` : position} title={position} onClick={() => setPosition(position)} />)}</div><small>Você também pode arrastar o timer diretamente na tela.</small></div>
    <button className={`fl-timer-share${state.visibleToClass ? ' active' : ''}`} onClick={toggleVisibility}>{state.visibleToClass ? <EyeOff/> : <Eye/>}{state.visibleToClass ? 'Ocultar da apresentação' : 'Exibir na apresentação'}</button>
  </section> : null;

  const overlay = overlayVisible && stage ? <div
    className={`fl-timer-overlay position-${state.position}${finished ? ' finished' : ''}${isHost ? ' draggable' : ''}`}
    style={state.position === 'custom' ? { left: `${state.customX}%`, top: `${state.customY}%` } : undefined}
    onPointerDown={startDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag}
  >
    {isHost && <GripHorizontal className="fl-timer-drag-handle" size={18}/>}<span>{finished ? 'TEMPO!' : formatTime(value)}</span><small>{state.mode === 'countdown' ? 'TEMPO RESTANTE' : 'CRONÔMETRO'}</small>
    {!isHost && <i><TimerReset size={13}/> Foco Live</i>}
  </div> : null;

  return <>{controller && createPortal(controller, root)}{overlay && stage && createPortal(overlay, stage)}</>;
}
