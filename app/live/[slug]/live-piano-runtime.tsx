'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { ChevronDown, ChevronLeft, ChevronRight, KeyboardMusic, Midi, Music2, Volume2, X } from 'lucide-react';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_STEPS = [1, 3, 6, 8, 10];
const KEYBOARD_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16,
};

function noteLabel(midi: number) {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function isBlack(midi: number) {
  return BLACK_STEPS.includes(midi % 12);
}

type PianoMessage =
  | { type: 'foco-piano-state'; open: boolean; baseMidi?: number }
  | { type: 'foco-piano-note'; midi: number; velocity?: number; sustain?: boolean }
  | { type: string; [key: string]: unknown };

type PianoWindow = Window & {
  __FOCO_LIVE_CALL__?: any;
  __FOCO_PIANO_WRAPPED__?: boolean;
  __FOCO_PIANO_LISTENERS__?: Set<(data: PianoMessage) => void>;
  __FOCO_PIANO_ATTACHED__?: WeakSet<object>;
};

function attachCall(call: any, target: PianoWindow) {
  if (!call || typeof call !== 'object') return;
  target.__FOCO_LIVE_CALL__ = call;
  target.__FOCO_PIANO_ATTACHED__ ||= new WeakSet<object>();
  if (target.__FOCO_PIANO_ATTACHED__.has(call)) return;
  target.__FOCO_PIANO_ATTACHED__.add(call);
  call.on?.('app-message', (event: any) => {
    const data = event?.data as PianoMessage | undefined;
    if (!data?.type?.startsWith('foco-piano-')) return;
    target.__FOCO_PIANO_LISTENERS__?.forEach((listener) => listener(data));
  });
}

function installCallBridge(listener: (data: PianoMessage) => void) {
  const target = window as PianoWindow;
  target.__FOCO_PIANO_LISTENERS__ ||= new Set();
  target.__FOCO_PIANO_LISTENERS__.add(listener);

  if (!target.__FOCO_PIANO_WRAPPED__) {
    const originalCreateCallObject = DailyIframe.createCallObject.bind(DailyIframe);
    (DailyIframe as any).createCallObject = (...args: any[]) => {
      const call = originalCreateCallObject(...args);
      attachCall(call, target);
      return call;
    };
    target.__FOCO_PIANO_WRAPPED__ = true;
  }

  if (target.__FOCO_LIVE_CALL__) attachCall(target.__FOCO_LIVE_CALL__, target);
  return () => target.__FOCO_PIANO_LISTENERS__?.delete(listener);
}

export default function LivePianoRuntime() {
  const audioRef = useRef<AudioContext | null>(null);
  const noteTimersRef = useRef<Map<number, number>>(new Map());
  const [isHost, setIsHost] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [baseMidi, setBaseMidi] = useState(48);
  const [volume, setVolume] = useState(0.88);
  const [sustain, setSustain] = useState(true);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [lastNote, setLastNote] = useState<number | null>(null);
  const [midiStatus, setMidiStatus] = useState<'idle' | 'ready' | 'unsupported' | 'error'>('idle');

  const notes = useMemo(() => Array.from({ length: 25 }, (_, index) => baseMidi + index), [baseMidi]);

  function getAudio() {
    if (!audioRef.current) audioRef.current = new AudioContext({ latencyHint: 'interactive' });
    return audioRef.current;
  }

  function markActive(midi: number, duration = 430) {
    const previous = noteTimersRef.current.get(midi);
    if (previous) window.clearTimeout(previous);
    setActiveNotes((current) => new Set(current).add(midi));
    const timer = window.setTimeout(() => {
      setActiveNotes((current) => {
        const next = new Set(current);
        next.delete(midi);
        return next;
      });
      noteTimersRef.current.delete(midi);
    }, duration);
    noteTimersRef.current.set(midi, timer);
  }

  async function playNote(midi: number, velocity = volume, shouldBroadcast = false) {
    const context = getAudio();
    await context.resume().catch(() => undefined);
    markActive(midi, sustain ? 760 : 360);
    setLastNote(midi);
    void playPianoSample(
      context,
      midi,
      context.currentTime + 0.012,
      context.currentTime + (sustain ? 4.8 : 1.7),
      Math.max(0.12, Math.min(1.15, velocity)),
    );
    if (shouldBroadcast) {
      const call = (window as PianoWindow).__FOCO_LIVE_CALL__;
      call?.sendAppMessage?.({ type: 'foco-piano-note', midi, velocity, sustain }, '*');
    }
  }

  function publishState(nextOpen: boolean, nextBaseMidi = baseMidi) {
    const call = (window as PianoWindow).__FOCO_LIVE_CALL__;
    call?.sendAppMessage?.({ type: 'foco-piano-state', open: nextOpen, baseMidi: nextBaseMidi }, '*');
  }

  function togglePiano() {
    const next = !open;
    setOpen(next);
    publishState(next);
    if (!next && audioRef.current) stopPianoSamples(audioRef.current);
  }

  function shiftOctave(direction: -1 | 1) {
    const next = Math.max(36, Math.min(72, baseMidi + direction * 12));
    setBaseMidi(next);
    publishState(open, next);
    if (audioRef.current) void preloadPianoSamples(audioRef.current, Array.from({ length: 25 }, (_, index) => next + index));
  }

  async function connectMidi() {
    const requestMIDIAccess = (navigator as any).requestMIDIAccess;
    if (typeof requestMIDIAccess !== 'function') return setMidiStatus('unsupported');
    try {
      const access = await requestMIDIAccess.call(navigator);
      access.inputs.forEach((input: any) => {
        input.onmidimessage = (event: any) => {
          const [status, midi, velocity] = event.data || [];
          const command = status & 0xf0;
          if (command === 0x90 && velocity > 0) void playNote(midi, Math.max(0.18, velocity / 127), true);
        };
      });
      setMidiStatus('ready');
    } catch {
      setMidiStatus('error');
    }
  }

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    const syncRoom = () => setRoomReady(Boolean(document.querySelector('.fl-room')));
    const observer = new MutationObserver(syncRoom);
    observer.observe(document.body, { childList: true, subtree: true });
    syncRoom();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const room = document.querySelector('.fl-room');
    room?.classList.toggle('foco-piano-open', open);
    return () => room?.classList.remove('foco-piano-open');
  }, [open, roomReady]);

  useEffect(() => installCallBridge((data) => {
    if (data.type === 'foco-piano-state' && !isHost) {
      setOpen(Boolean(data.open));
      if (typeof data.baseMidi === 'number') setBaseMidi(data.baseMidi);
    }
    if (data.type === 'foco-piano-note' && !isHost && typeof data.midi === 'number') {
      void playNote(data.midi, typeof data.velocity === 'number' ? data.velocity : 0.88, false);
    }
  }), [isHost, volume, sustain]);

  useEffect(() => {
    if (!open) return;
    const context = getAudio();
    void context.resume().then(() => preloadPianoSamples(context, notes)).catch(() => undefined);
  }, [open, notes]);

  useEffect(() => {
    if (!isHost || !open) return;
    const pressed = new Set<string>();
    const down = (event: KeyboardEvent) => {
      if (event.repeat || pressed.has(event.key.toLowerCase())) return;
      const offset = KEYBOARD_MAP[event.key.toLowerCase()];
      if (offset === undefined) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input,textarea,[contenteditable="true"]')) return;
      event.preventDefault();
      pressed.add(event.key.toLowerCase());
      void playNote(baseMidi + offset, volume, true);
    };
    const up = (event: KeyboardEvent) => pressed.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [baseMidi, isHost, open, volume, sustain]);

  useEffect(() => {
    if (!isHost || !roomReady) return;
    const timer = window.setInterval(() => {
      const call = (window as PianoWindow).__FOCO_LIVE_CALL__;
      if (!call || (call as any).__focoPianoStateAttached) return;
      (call as any).__focoPianoStateAttached = true;
      call.on?.('participant-joined', () => publishState(open, baseMidi));
    }, 600);
    return () => window.clearInterval(timer);
  }, [isHost, roomReady, open, baseMidi]);

  useEffect(() => () => {
    noteTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    if (audioRef.current) {
      stopPianoSamples(audioRef.current);
      void audioRef.current.close().catch(() => undefined);
    }
  }, []);

  if (!roomReady || (!isHost && !open)) return null;

  return <>
    {isHost && <button className={`fl-piano-launcher${open ? ' active' : ''}`} onClick={togglePiano} aria-expanded={open} title="Abrir piano da aula">
      <KeyboardMusic size={21} /><span>{open ? 'Fechar piano' : 'Piano'}</span>
    </button>}

    {open && <section className={`fl-piano-dock${isHost ? ' host' : 'viewer'}`} aria-label="Foco Keys — piano da aula">
      <header>
        <div className="fl-piano-title"><span><Music2 size={17} /></span><div><strong>Foco Keys</strong><small>{isHost ? 'Toque e todos ouvirão' : 'Piano do professor'}</small></div></div>
        <div className="fl-piano-readout"><b>{lastNote === null ? '—' : noteLabel(lastNote)}</b><small>{lastNote === null ? 'Aguardando nota' : `MIDI ${lastNote}`}</small></div>
        {isHost && <div className="fl-piano-tools">
          <button onClick={() => shiftOctave(-1)} disabled={baseMidi <= 36} title="Oitava abaixo"><ChevronLeft size={17} /></button>
          <span>{noteLabel(baseMidi)}–{noteLabel(baseMidi + 24)}</span>
          <button onClick={() => shiftOctave(1)} disabled={baseMidi >= 72} title="Oitava acima"><ChevronRight size={17} /></button>
          <label><Volume2 size={15} /><input type="range" min="0.2" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>
          <button className={sustain ? 'active' : ''} onClick={() => setSustain((current) => !current)}>Sustain</button>
          <button className={midiStatus === 'ready' ? 'active' : ''} onClick={connectMidi} title="Conectar teclado MIDI"><Midi size={16} /> MIDI</button>
        </div>}
        {isHost ? <button className="fl-piano-close" onClick={togglePiano}><X size={18} /></button> : <span className="fl-piano-live-badge">AO VIVO</span>}
      </header>

      <div className="fl-piano-scroll" role="application" aria-label="Teclado de piano">
        <div className="fl-piano-keyboard">
          {notes.filter((midi) => WHITE_STEPS.includes(midi % 12)).map((midi) => <button
            key={midi}
            className={`fl-piano-key white${activeNotes.has(midi) ? ' active' : ''}`}
            disabled={!isHost}
            onPointerDown={(event) => { event.preventDefault(); void playNote(midi, volume, true); }}
            aria-label={noteLabel(midi)}
          ><span>{noteLabel(midi)}</span></button>)}
          {notes.filter(isBlack).map((midi) => {
            const whiteBefore = notes.filter((note) => note < midi && WHITE_STEPS.includes(note % 12)).length;
            return <button
              key={midi}
              className={`fl-piano-key black${activeNotes.has(midi) ? ' active' : ''}`}
              style={{ '--black-position': whiteBefore } as React.CSSProperties}
              disabled={!isHost}
              onPointerDown={(event) => { event.preventDefault(); void playNote(midi, volume, true); }}
              aria-label={noteLabel(midi)}
            />;
          })}
        </div>
      </div>
      {isHost && <footer><span>Teclado: A W S E D F T G Y H U J K O L P ;</span><button onClick={togglePiano}><ChevronDown size={16} /> Recolher</button></footer>}
    </section>}
  </>;
}
