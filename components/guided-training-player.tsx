'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise, TrainingNote } from '@/lib/training-center';
import { midiToBrazilianNoteName, noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';

const MIN_MIDI = 36;
const MAX_MIDI = 84;
const HIT_X = 18;
const PX_PER_BEAT = 10;
const LOOKAHEAD = 9;
const SCALE = Array.from({ length: MAX_MIDI - MIN_MIDI + 1 }, (_, index) => MAX_MIDI - index);

type AudioCtor = typeof AudioContext;
type WinAudio = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type BeatNote = TrainingNote & { startBeat: number; durationBeats: number; endBeat: number; midi: number | null };
type Vars = CSSProperties & { '--progress': string };

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function yFromMidi(midi: number | null) { if (midi == null) return 50; const safe = clamp(midi, MIN_MIDI, MAX_MIDI); return 100 - ((safe - MIN_MIDI) / (MAX_MIDI - MIN_MIDI)) * 100; }
function formatTime(seconds: number) { const safe = Math.max(0, Math.floor(seconds)); return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`; }
function buildBeatNotes(exercise: TrainingExercise): BeatNote[] { const originalBeatSeconds = 60 / exercise.bpm; return exercise.notes.map((note) => ({ ...note, startBeat: note.start / originalBeatSeconds, durationBeats: note.duration / originalBeatSeconds, endBeat: (note.start + note.duration) / originalBeatSeconds, midi: noteNameToMidi(note.pitch) })); }
function getAudioCtor() { if (typeof window === 'undefined') return null; return (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext || null; }

export function GuidedTrainingPlayer({ exercise }: { exercise: TrainingExercise; compact?: boolean }) {
  const [currentBeat, setCurrentBeat] = useState(0);
  const [bpm, setBpm] = useState(exercise.bpm);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const [controls, setControls] = useState(true);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const nextScheduledBeatRef = useRef(0);
  const audioAnchorRef = useRef<number | null>(null);
  const currentBeatRef = useRef(0);

  const beatNotes = useMemo(() => buildBeatNotes(exercise), [exercise]);
  const totalBeats = useMemo(() => Math.max(...beatNotes.map((note) => note.endBeat), 0), [beatNotes]);
  const beatSeconds = 60 / bpm;
  const currentSeconds = currentBeat * beatSeconds;
  const durationSeconds = totalBeats * beatSeconds;
  const activeNote = beatNotes.find((note) => note.mode !== 'guide' && currentBeat >= note.startBeat && currentBeat <= note.endBeat);
  const activeMidi = activeNote?.midi ?? null;
  const executionLabel = activeNote?.label || beatNotes.find((note) => note.label && note.mode !== 'guide')?.label || 'Cante junto';
  const progress = totalBeats ? Math.min(100, (currentBeat / totalBeats) * 100) : 0;
  const cssVars = { '--progress': `${progress}%` } as Vars;
  currentBeatRef.current = currentBeat;

  useEffect(() => () => stopAudio(), []);

  useEffect(() => {
    if (!playing) return;
    lastFrameRef.current = null;
    const tick = (now: number) => {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const deltaSeconds = Math.min(0.08, Math.max(0, (now - lastFrameRef.current) / 1000));
      lastFrameRef.current = now;
      setCurrentBeat((oldBeat) => {
        const nextBeat = oldBeat + deltaSeconds / beatSeconds;
        scheduleTimeline(oldBeat, nextBeat + LOOKAHEAD);
        if (nextBeat >= totalBeats) {
          stopAudio(false);
          if (!loop) { setPlaying(false); return totalBeats; }
          const context = getAudioContext();
          if (context) audioAnchorRef.current = context.currentTime + 0.04;
          nextScheduledBeatRef.current = 0;
          scheduleTimeline(0, LOOKAHEAD);
          return 0;
        }
        return nextBeat;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, totalBeats, beatSeconds, loop]);

  useEffect(() => {
    if (!playing) return;
    const context = getAudioContext();
    if (!context) return;
    stopAudio(false);
    audioAnchorRef.current = context.currentTime - currentBeatRef.current * beatSeconds + 0.02;
    nextScheduledBeatRef.current = currentBeatRef.current;
    scheduleTimeline(currentBeatRef.current, currentBeatRef.current + LOOKAHEAD);
  }, [bpm]);

  function getAudioContext() {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctor = getAudioCtor();
    audioCtxRef.current = Ctor ? new Ctor() : null;
    return audioCtxRef.current;
  }

  function stopAudio(clearCount = true) {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    stopPianoSamples(audioCtxRef.current ?? undefined);
    oscillatorsRef.current.forEach((oscillator) => { try { oscillator.stop(); } catch {} });
    oscillatorsRef.current = [];
    if (clearCount) setCount(null);
  }

  function playClick(context: AudioContext, at: number, strong = false) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = strong ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(strong ? 1320 : 940, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.15 : 0.08, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.075);
    oscillatorsRef.current.push(oscillator);
  }

  function scheduleTimeline(fromBeat: number, toBeat: number) {
    const context = getAudioContext();
    const anchor = audioAnchorRef.current;
    if (!context || anchor == null || toBeat <= nextScheduledBeatRef.current) return;
    const now = context.currentTime;
    const startBeat = Math.max(fromBeat, nextScheduledBeatRef.current);
    const endBeat = Math.min(toBeat, totalBeats);

    const clickBeats = Array.from(new Set(beatNotes
      .filter((note) => note.startBeat >= startBeat && note.startBeat < endBeat)
      .map((note) => Number(note.startBeat.toFixed(4))))).sort((a, b) => a - b);

    clickBeats.forEach((beatValue, index) => {
      const at = anchor + beatValue * beatSeconds;
      if (at > now + 0.015) playClick(context, at, index === 0 || Math.abs(beatValue % 4) < 0.02);
    });

    beatNotes.forEach((note) => {
      if (note.midi == null || note.startBeat < startBeat || note.startBeat >= endBeat) return;
      const startAt = anchor + note.startBeat * beatSeconds;
      const endAt = anchor + note.endBeat * beatSeconds;
      if (endAt <= now + 0.02) return;
      void playPianoSample(context, note.midi, Math.max(now + 0.015, startAt), Math.max(now + 0.35, endAt), note.mode === 'guide' ? 0.82 : 1);
    });

    nextScheduledBeatRef.current = endBeat;
  }

  async function startPlayback() {
    if (playing || count) { stopAudio(); setPlaying(false); setControls(true); return; }
    const context = getAudioContext();
    if (!context) return;
    await context.resume().catch(() => null);
    stopAudio();
    const startBeat = currentBeat >= totalBeats ? 0 : currentBeat;
    void preloadPianoSamples(context, beatNotes.filter((note) => note.midi != null).map((note) => note.midi as number));
    const beatMs = beatSeconds * 1000;
    [4, 3, 2, 1].forEach((value, index) => timersRef.current.push(window.setTimeout(() => { setCount(value); playClick(context, context.currentTime + 0.01, value === 4); }, index * beatMs)));
    timersRef.current.push(window.setTimeout(() => {
      setCount(null);
      setCurrentBeat(startBeat);
      audioAnchorRef.current = context.currentTime - startBeat * beatSeconds + 0.035;
      nextScheduledBeatRef.current = startBeat;
      scheduleTimeline(startBeat, startBeat + LOOKAHEAD);
      setPlaying(true);
    }, 4 * beatMs));
  }

  function restart() { stopAudio(); setPlaying(false); setCurrentBeat(0); audioAnchorRef.current = null; nextScheduledBeatRef.current = 0; setControls(true); }
  function targetStyle(note: BeatNote): CSSProperties | null { if (note.mode === 'guide' || note.midi == null) return null; const left = HIT_X + (note.startBeat - currentBeat) * PX_PER_BEAT; const width = Math.max(5, note.durationBeats * PX_PER_BEAT); if (left + width < -6 || left > HIT_X + LOOKAHEAD * PX_PER_BEAT) return null; return { left: `${left}%`, width: `${width}%`, top: `${yFromMidi(note.midi)}%` }; }

  return (
    <section className={`synced-player ${controls ? 'controls-on' : ''}`} style={cssVars} onPointerDown={() => setControls(true)}>
      <style>{css}</style>
      <div className="synced-bg" />
      <div className="synced-stage">
        <div className="synced-ruler">{SCALE.map((midi) => <span className={activeMidi === midi ? 'active' : ''} key={midi}>{midiToBrazilianNoteName(midi)}</span>)}</div>
        <div className="synced-lane"><div className="synced-hit" />{beatNotes.map((note, index) => { const style = targetStyle(note); return style ? <span className="synced-note" style={style} key={`${note.pitch}-${index}`} /> : null; })}</div>
      </div>
      <div className="synced-top"><strong>{exercise.title}</strong><span>{formatTime(currentSeconds)} / {formatTime(durationSeconds)}</span></div>
      <div className="synced-bar"><i /></div>
      <div className="synced-label">{executionLabel}</div>
      {count ? <div className="synced-count"><b>{count}</b></div> : null}
      <div className="synced-overlay" onPointerDown={(event) => event.stopPropagation()}>
        <button className="synced-back" type="button" onClick={() => window.history.back()}>←</button>
        <div className="synced-bpm"><button type="button" onClick={() => setBpm((value) => Math.max(48, value - 2))}>−</button><span><b>{bpm}</b><small>BPM</small></span><button type="button" onClick={() => setBpm((value) => Math.min(140, value + 2))}>+</button></div>
        <div className="synced-controls"><button type="button" onClick={restart}>↺<span>Reiniciar</span></button><button className="synced-main" type="button" onClick={startPlayback}>{playing ? 'Ⅱ' : count ? '×' : '▶'}<span>{playing ? 'Pausar' : count ? 'Cancelar' : 'Iniciar'}</span></button><button type="button" onClick={() => setLoop((value) => !value)}>∞<span>{loop ? 'Loop' : 'Único'}</span></button></div>
      </div>
    </section>
  );
}

const css = `.synced-player{position:relative;min-height:100dvh;overflow:hidden;background:#050607;color:#fff;touch-action:manipulation}.synced-bg{position:absolute;inset:0;background:linear-gradient(180deg,#121419,#050608 62%,#020304)}.synced-stage{position:absolute;inset:8.6dvh 0 10.8dvh 0;z-index:4}.synced-ruler{position:absolute;left:3px;top:0;bottom:0;width:54px;display:flex;flex-direction:column;justify-content:space-between;font-size:clamp(5px,.72dvh,9px);font-weight:800;color:rgba(255,255,255,.18)}.synced-ruler span.active{color:#ff3131;font-size:1.35em;text-shadow:0 0 14px rgba(255,49,49,.85)}.synced-lane{position:absolute;left:54px;right:0;top:0;bottom:0;overflow:hidden}.synced-hit{position:absolute;left:18%;top:0;bottom:0;width:1px;background:rgba(255,255,255,.32);z-index:2}.synced-note{position:absolute;height:clamp(7px,.95dvh,12px);border-radius:999px;background:rgba(255,255,255,.72);box-shadow:0 0 16px rgba(255,255,255,.24);transform:translateY(-50%);z-index:4}.synced-top{position:absolute;left:64px;right:20px;top:2.2dvh;z-index:10;text-align:center;opacity:.72}.synced-top strong{display:block;font-size:clamp(13px,1.9dvh,18px);letter-spacing:.08em}.synced-top span{font-size:11px;color:rgba(255,255,255,.52)}.synced-bar{position:absolute;left:72px;right:48px;top:7.2dvh;height:3px;border-radius:999px;background:rgba(255,255,255,.16);z-index:10;overflow:hidden}.synced-bar i{display:block;height:100%;width:var(--progress);background:rgba(255,255,255,.72)}.synced-label{position:absolute;left:24px;right:24px;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 42px);z-index:11;text-align:center;font-size:clamp(28px,7vw,58px);font-weight:950;color:rgba(255,255,255,.88);text-shadow:0 0 26px rgba(255,255,255,.18)}.synced-overlay{position:absolute;inset:0;z-index:20;opacity:0;pointer-events:none;transition:opacity .25s;background:linear-gradient(180deg,rgba(0,0,0,.18),transparent 35%,transparent 52%,rgba(0,0,0,.5))}.controls-on .synced-overlay{opacity:1;pointer-events:auto}.synced-back{position:absolute;left:18px;top:2.2dvh;width:44px;height:44px;border:1px solid rgba(255,255,255,.08);border-radius:50%;background:rgba(255,255,255,.06);color:#fff;font-size:24px}.synced-bpm{position:absolute;left:50%;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 118px);transform:translateX(-50%);display:flex;align-items:center;gap:18px}.synced-bpm button{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#fff;font-size:24px}.synced-bpm span{display:grid;place-items:center;min-width:78px}.synced-bpm b{font-size:28px;line-height:1}.synced-bpm small{font-size:10px;letter-spacing:.18em;color:rgba(255,255,255,.58)}.synced-controls{position:absolute;left:24px;right:24px;bottom:max(18px,env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr 1.2fr 1fr;align-items:end;gap:18px}.synced-controls button{border:0;background:transparent;color:#fff;font-weight:700;padding:0;display:grid;place-items:center;gap:8px;font-size:38px}.synced-controls button span{font-size:13px;font-weight:500;color:rgba(255,255,255,.76)}.synced-controls .synced-main{width:86px;height:86px;justify-self:center;border:2px solid rgba(255,255,255,.86);border-radius:50%;font-size:42px;background:rgba(255,255,255,.025)}.synced-controls .synced-main span{position:absolute;top:94px}.synced-count{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.5);z-index:30}.synced-count b{font-size:110px;color:#f5c76b;text-shadow:0 0 50px rgba(245,199,107,.8)}`;
