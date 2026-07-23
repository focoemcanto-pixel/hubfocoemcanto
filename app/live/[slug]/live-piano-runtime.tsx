'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { ChevronLeft, ChevronRight, Eye, EyeOff, KeyboardMusic, Music2, Volume2, X } from 'lucide-react';
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

function isBlack(midi: number) { return BLACK_STEPS.includes(midi % 12); }

type PianoMessage =
  | { type: 'foco-piano-state'; visible: boolean; baseMidi: number; sustain: boolean }
  | { type: 'foco-piano-note-on'; midi: number; velocity: number; sustain: boolean; sequence: number }
  | { type: 'foco-piano-note-off'; midi: number; sequence: number }
  | { type: 'foco-piano-request-state' };

type PianoCall = {
  on?: (event: string, listener: (event: { data?: PianoMessage }) => void) => void;
  sendAppMessage?: (message: PianoMessage, recipient: string) => void;
  __focoPianoAttached?: boolean;
};

type PianoWindow = Window & {
  __FOCO_LIVE_CALL__?: PianoCall;
  __FOCO_PIANO_WRAPPED__?: boolean;
  __FOCO_PIANO_LISTENERS__?: Set<(data: PianoMessage) => void>;
};

function attachCall(call: PianoCall | undefined, target: PianoWindow) {
  if (!call || call.__focoPianoAttached) return;
  target.__FOCO_LIVE_CALL__ = call;
  call.__focoPianoAttached = true;
  call.on?.('app-message', (event) => {
    const data = event?.data;
    if (!data?.type?.startsWith('foco-piano-')) return;
    target.__FOCO_PIANO_LISTENERS__?.forEach((listener) => listener(data));
  });
}

function installCallBridge(listener: (data: PianoMessage) => void) {
  const target = window as PianoWindow;
  target.__FOCO_PIANO_LISTENERS__ ||= new Set();
  target.__FOCO_PIANO_LISTENERS__.add(listener);
  if (!target.__FOCO_PIANO_WRAPPED__) {
    const original = DailyIframe.createCallObject.bind(DailyIframe);
    (DailyIframe as typeof DailyIframe & { createCallObject: (...args: Parameters<typeof original>) => ReturnType<typeof original> }).createCallObject = (...args) => {
      const call = original(...args);
      target.__FOCO_LIVE_CALL__ = call as unknown as PianoCall;
      attachCall(call as unknown as PianoCall, target);
      return call;
    };
    target.__FOCO_PIANO_WRAPPED__ = true;
  }
  attachCall(target.__FOCO_LIVE_CALL__, target);
  return () => target.__FOCO_PIANO_LISTENERS__?.delete(listener);
}

export default function LivePianoRuntime() {
  const audioRef = useRef<AudioContext | null>(null);
  const sequenceRef = useRef(0);
  const pressedMidiRef = useRef<Map<string, number>>(new Map());
  const [isHost, setIsHost] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [baseMidi, setBaseMidi] = useState(48);
  const [volume, setVolume] = useState(0.88);
  const [sustain, setSustain] = useState(true);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [lastNote, setLastNote] = useState<number | null>(null);
  const [midiStatus, setMidiStatus] = useState<'idle' | 'ready' | 'unsupported' | 'error'>('idle');
  const notes = useMemo(() => Array.from({ length: 25 }, (_, index) => baseMidi + index), [baseMidi]);

  const call = () => (window as PianoWindow).__FOCO_LIVE_CALL__;
  const getAudio = () => (audioRef.current ||= new AudioContext({ latencyHint: 'interactive' }));

  function publishState(forceVisible = broadcasting) {
    call()?.sendAppMessage?.({ type: 'foco-piano-state', visible: forceVisible, baseMidi, sustain }, '*');
  }

  async function soundNote(midi: number, velocity: number, noteSustain: boolean) {
    const context = getAudio();
    await context.resume().catch(() => undefined);
    await preloadPianoSamples(context, [midi]).catch(() => undefined);
    void playPianoSample(context, midi, context.currentTime, context.currentTime + (noteSustain ? 4.8 : 1.7), Math.max(0.12, Math.min(1.15, velocity)));
  }

  function noteOnVisual(midi: number) {
    setActiveNotes((current) => new Set(current).add(midi));
    setLastNote(midi);
  }

  function noteOffVisual(midi: number) {
    setActiveNotes((current) => { const next = new Set(current); next.delete(midi); return next; });
  }

  async function playHostNote(midi: number, velocity = volume) {
    noteOnVisual(midi);
    if (broadcasting) call()?.sendAppMessage?.({ type: 'foco-piano-note-on', midi, velocity, sustain, sequence: ++sequenceRef.current }, '*');
    await soundNote(midi, velocity, sustain);
  }

  function releaseHostNote(midi: number) {
    noteOffVisual(midi);
    if (broadcasting) call()?.sendAppMessage?.({ type: 'foco-piano-note-off', midi, sequence: ++sequenceRef.current }, '*');
  }

  function closePiano() {
    if (broadcasting) call()?.sendAppMessage?.({ type: 'foco-piano-state', visible: false, baseMidi, sustain }, '*');
    setBroadcasting(false);
    setOpen(false);
    if (audioRef.current) stopPianoSamples(audioRef.current);
  }

  function toggleBroadcast() {
    if (!isHost || !open) return;
    const next = !broadcasting;
    setBroadcasting(next);
    call()?.sendAppMessage?.({ type: 'foco-piano-state', visible: next, baseMidi, sustain }, '*');
  }

  function shiftOctave(direction: -1 | 1) {
    const next = Math.max(36, Math.min(72, baseMidi + direction * 12));
    setBaseMidi(next);
    if (broadcasting) call()?.sendAppMessage?.({ type: 'foco-piano-state', visible: true, baseMidi: next, sustain }, '*');
    if (audioRef.current) void preloadPianoSamples(audioRef.current, Array.from({ length: 25 }, (_, index) => next + index));
  }

  async function connectMidi() {
    const requestMIDIAccess = (navigator as Navigator & { requestMIDIAccess?: () => Promise<any> }).requestMIDIAccess;
    if (!requestMIDIAccess) return setMidiStatus('unsupported');
    try {
      const access = await requestMIDIAccess.call(navigator);
      access.inputs.forEach((input: { onmidimessage: ((event: { data?: number[] }) => void) | null }) => {
        input.onmidimessage = (event) => {
          const [status = 0, midi = 0, velocity = 0] = event.data || [];
          const command = status & 0xf0;
          if (command === 0x90 && velocity > 0) void playHostNote(midi, Math.max(0.18, velocity / 127));
          if (command === 0x80 || (command === 0x90 && velocity === 0)) releaseHostNote(midi);
        };
      });
      setMidiStatus('ready');
    } catch { setMidiStatus('error'); }
  }

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    const sync = () => setRoomReady(Boolean(document.querySelector('.fl-room')));
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const room = document.querySelector('.fl-room');
    room?.classList.toggle('foco-piano-open', open);
    room?.classList.toggle('foco-piano-broadcasting', broadcasting);
    return () => room?.classList.remove('foco-piano-open', 'foco-piano-broadcasting');
  }, [open, broadcasting, roomReady]);

  useEffect(() => {
    const toggle = () => { if (isHost) setOpen((current) => !current); };
    window.addEventListener('foco-piano-toggle', toggle);
    return () => window.removeEventListener('foco-piano-toggle', toggle);
  }, [isHost]);

  useEffect(() => installCallBridge((data) => {
    if (data.type === 'foco-piano-request-state' && isHost) publishState();
    if (data.type === 'foco-piano-state' && !isHost) {
      setOpen(data.visible);
      setBroadcasting(data.visible);
      setBaseMidi(data.baseMidi);
      setSustain(data.sustain);
    }
    if (data.type === 'foco-piano-note-on' && !isHost) {
      noteOnVisual(data.midi);
      void soundNote(data.midi, data.velocity, data.sustain);
    }
    if (data.type === 'foco-piano-note-off' && !isHost) noteOffVisual(data.midi);
  }), [isHost, broadcasting, baseMidi, sustain]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = call();
      if (!current || (current as PianoCall & { __focoPianoHandshake?: boolean }).__focoPianoHandshake) return;
      (current as PianoCall & { __focoPianoHandshake?: boolean }).__focoPianoHandshake = true;
      current.on?.('joined-meeting', () => { if (!isHost) current.sendAppMessage?.({ type: 'foco-piano-request-state' }, '*'); });
      current.on?.('participant-joined', () => { if (isHost) publishState(); });
      if (!isHost) current.sendAppMessage?.({ type: 'foco-piano-request-state' }, '*');
    }, 500);
    return () => window.clearInterval(timer);
  }, [isHost, broadcasting, baseMidi, sustain]);

  useEffect(() => {
    if (!open || !isHost) return;
    const context = getAudio();
    void context.resume().then(() => preloadPianoSamples(context, notes)).catch(() => undefined);
  }, [open, notes, isHost]);

  useEffect(() => {
    if (!isHost || !open) return;
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.repeat || pressedMidiRef.current.has(key)) return;
      const offset = KEYBOARD_MAP[key];
      if (offset === undefined || (event.target as HTMLElement | null)?.matches('input,textarea,[contenteditable="true"]')) return;
      event.preventDefault();
      const midi = baseMidi + offset;
      pressedMidiRef.current.set(key, midi);
      void playHostNote(midi, volume);
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const midi = pressedMidiRef.current.get(key);
      if (midi === undefined) return;
      pressedMidiRef.current.delete(key);
      releaseHostNote(midi);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [baseMidi, isHost, open, volume, sustain, broadcasting]);

  useEffect(() => () => {
    if (audioRef.current) { stopPianoSamples(audioRef.current); void audioRef.current.close().catch(() => undefined); }
  }, []);

  if (!roomReady || !open) return null;
  const whiteNotes = notes.filter((midi) => WHITE_STEPS.includes(midi % 12));

  return <section className={`fl-piano-dock${isHost ? ' host' : ' viewer'}`} aria-label="Foco Keys — piano da aula">
    <header>
      <div className="fl-piano-title"><span><Music2 size={17} /></span><div><strong>Foco Keys</strong><small>{isHost ? 'Abra, prepare e escolha quando exibir' : 'Piano do professor — somente visualização'}</small></div></div>
      <div className="fl-piano-readout"><b>{lastNote === null ? '—' : noteLabel(lastNote)}</b><small>{lastNote === null ? 'Aguardando nota' : `MIDI ${lastNote}`}</small></div>
      {isHost && <div className="fl-piano-tools">
        <button onClick={() => shiftOctave(-1)} disabled={baseMidi <= 36}><ChevronLeft size={17} /></button><span>{noteLabel(baseMidi)}–{noteLabel(baseMidi + 24)}</span><button onClick={() => shiftOctave(1)} disabled={baseMidi >= 72}><ChevronRight size={17} /></button>
        <label><Volume2 size={15} /><input type="range" min="0.2" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>
        <button className={sustain ? 'active' : ''} onClick={() => setSustain((current) => !current)}>Sustain</button>
        <button className={midiStatus === 'ready' ? 'active' : ''} onClick={connectMidi}><KeyboardMusic size={16} /> MIDI</button>
        <button className={broadcasting ? 'active' : ''} onClick={toggleBroadcast}>{broadcasting ? <EyeOff size={16} /> : <Eye size={16} />}{broadcasting ? 'Ocultar da turma' : 'Exibir para a turma'}</button>
      </div>}
      {isHost ? <button className="fl-piano-close" onClick={closePiano}><X size={18} /></button> : <span className="fl-piano-live-badge">AO VIVO · SOM E IMAGEM</span>}
    </header>
    <div className="fl-piano-scroll" aria-label="Teclado de piano"><div className="fl-piano-keyboard">
      {whiteNotes.map((midi) => isHost ? <button key={midi} className={`fl-piano-key white${activeNotes.has(midi) ? ' active' : ''}`} onPointerDown={(event) => { event.preventDefault(); void playHostNote(midi, volume); }} onPointerUp={() => releaseHostNote(midi)} onPointerLeave={() => releaseHostNote(midi)}><span>{noteLabel(midi)}</span></button> : <div key={midi} className={`fl-piano-key white viewer-key${activeNotes.has(midi) ? ' active' : ''}`}><span>{noteLabel(midi)}</span></div>)}
      {notes.filter(isBlack).map((midi) => { const whiteBefore = notes.filter((note) => note < midi && WHITE_STEPS.includes(note % 12)).length; const props = { className: `fl-piano-key black${activeNotes.has(midi) ? ' active' : ''}`, style: { '--black-position': whiteBefore } as React.CSSProperties }; return isHost ? <button key={midi} {...props} onPointerDown={(event) => { event.preventDefault(); void playHostNote(midi, volume); }} onPointerUp={() => releaseHostNote(midi)} onPointerLeave={() => releaseHostNote(midi)} /> : <div key={midi} {...props} />; })}
    </div></div>
  </section>;
}
