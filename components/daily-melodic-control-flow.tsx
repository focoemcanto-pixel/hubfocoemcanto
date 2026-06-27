'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { autoCorrelate, midiToBrazilianNoteName, noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';
import './daily-melodic-control-flow.css';

type AudioCtor = typeof AudioContext;
type WinAudio = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type Stage = 'intro' | 'training' | 'finished';
type Drill = { title: string; subtitle: string; syllable: string; bpm: number; notes: number[]; beats: number };
type LiveVoice = { midi: number | null; cents: number | null; feedback: string };

const MIN_MIDI = 36;
const MAX_MIDI = 84;
const HIT_X = 18;
const PX_PER_BEAT = 11;
const PREVIEW_BEATS = 9.5;
const SCALE = Array.from({ length: MAX_MIDI - MIN_MIDI + 1 }, (_, i) => MAX_MIDI - i);
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const DEFAULT_LOW = noteNameToMidi('A2') ?? 45;
const DEFAULT_HIGH = noteNameToMidi('A4') ?? 69;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function getAudioCtor() {
  if (typeof window === 'undefined') return null;
  return (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext || null;
}
function yFromMidi(midi: number | null) {
  if (midi == null) return 50;
  const safe = clamp(midi, MIN_MIDI, MAX_MIDI);
  return 100 - ((safe - MIN_MIDI) / (MAX_MIDI - MIN_MIDI)) * 100;
}
function floatMidi(freq: number) { return 69 + 12 * Math.log2(freq / 440); }
function secondsToClock(total: number) { const safe = Math.max(0, Math.floor(total)); return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`; }
function bestRoot(low = DEFAULT_LOW, high = DEFAULT_HIGH) {
  const span = 12;
  const minRoot = Math.max(36, low);
  const maxRoot = Math.min(72, high - span);
  if (maxRoot >= minRoot) return minRoot;
  return Math.max(36, Math.min(60, high - span));
}
function makeDrills() {
  const root = bestRoot();
  const scaleUp = MAJOR.map((i) => root + i);
  const scaleDown = MAJOR.slice(0, -1).reverse().map((i) => root + i);
  const cumulative: number[] = [];
  for (let len = 1; len <= MAJOR.length; len += 1) {
    MAJOR.slice(0, len).forEach((i) => cumulative.push(root + i));
    MAJOR.slice(0, Math.max(0, len - 1)).reverse().forEach((i) => cumulative.push(root + i));
  }
  const triads = [0, 4, 7, 12, 7, 4, 0, 4, 7, 9, 7, 4, 0, 5, 9, 12, 9, 5, 0].map((i) => root + i);
  return [
    { title: 'Escala guiada', subtitle: 'Suba e volte mantendo o centro da nota.', syllable: '(Uhh...)', bpm: 74, notes: [...scaleUp, ...scaleDown], beats: 1.15 },
    { title: 'Escala acumulativa', subtitle: 'Dó, Dó-Ré-Dó, Dó-Ré-Mi-Ré-Dó... sempre voltando ao centro tonal.', syllable: '(Uhh...)', bpm: 82, notes: cumulative, beats: 0.78 },
    { title: 'Tríades e saltos', subtitle: 'Controle a altura nos saltos principais da tonalidade.', syllable: '(Uhh...)', bpm: 78, notes: triads, beats: 1 },
  ] satisfies Drill[];
}

export function DailyMelodicControlFlow({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const drills = useMemo(makeDrills, []);
  const [stage, setStage] = useState<Stage>('intro');
  const [drillIndex, setDrillIndex] = useState(0);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [bpmOffset, setBpmOffset] = useState(0);
  const [voice, setVoice] = useState<LiveVoice>({ midi: null, cents: null, feedback: 'Toque para iniciar' });
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const startedAtRef = useRef(Date.now());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const micRafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const lastFrameRef = useRef<number | null>(null);
  const nextAudioBeatRef = useRef(0);
  const nextClickBeatRef = useRef(0);
  const targetMidiRef = useRef<number | null>(null);
  const scoreRef = useRef({ hitFrames: 0, missFrames: 0, counted: new Set<number>() });
  const drill = drills[drillIndex];
  const activeBpm = clamp(drill.bpm + bpmOffset, 54, 118);
  const totalBeats = drill.notes.length * drill.beats;
  const beatSeconds = 60 / activeBpm;
  const progress = totalBeats ? clamp((currentBeat / totalBeats) * 100, 0, 100) : 0;
  const activeIndex = clamp(Math.floor(currentBeat / drill.beats), 0, drill.notes.length - 1);
  const activeMidi = playing && !paused ? drill.notes[activeIndex] : null;
  targetMidiRef.current = activeMidi;

  useEffect(() => () => stopAll(), []);
  useEffect(() => {
    const ctx = getAudioContext();
    if (ctx) void preloadPianoSamples(ctx, drills.flatMap((item) => item.notes));
  }, [drills]);

  function getAudioContext() {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctor = getAudioCtor();
    audioCtxRef.current = Ctor ? new Ctor() : null;
    return audioCtxRef.current;
  }
  function stopAll() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
    stopPianoSamples(audioCtxRef.current ?? undefined);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void micCtxRef.current?.close().catch(() => null);
    rafRef.current = null;
    micRafRef.current = null;
    streamRef.current = null;
    micCtxRef.current = null;
    setCount(null);
  }
  async function startMic() {
    if (micCtxRef.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const Ctor = getAudioCtor();
      if (!Ctor) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      streamRef.current = stream;
      micCtxRef.current = ctx;
      const buffer = new Float32Array(analyser.fftSize);
      const loop = () => {
        analyser.getFloatTimeDomainData(buffer);
        const freq = autoCorrelate(buffer, ctx.sampleRate);
        const target = targetMidiRef.current;
        if (!freq || target == null) {
          setVoice((old) => ({ ...old, midi: null, cents: null, feedback: target == null ? 'Aguardando início' : 'Cante próximo ao microfone' }));
        } else {
          const midi = floatMidi(freq);
          const cents = (midi - target) * 100;
          const ok = Math.abs(cents) <= 42;
          if (ok) scoreRef.current.hitFrames += 1;
          else scoreRef.current.missFrames += 1;
          setVoice({ midi, cents, feedback: ok ? 'Perfeito' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' });
        }
        micRafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch { setVoice((old) => ({ ...old, feedback: 'Permita o microfone' })); }
  }
  function playMetronomeClick(ctx: AudioContext, at: number, strong = false) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    oscillator.type = strong ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(strong ? 1320 : 940, at);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(strong ? 1500 : 1080, at);
    filter.Q.setValueAtTime(8, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.18 : 0.10, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.07);
  }
  function scheduleAudio(fromBeat: number, visualBeat: number) {
    const ctx = getAudioContext();
    if (!ctx || paused) return;
    void ctx.resume().catch(() => null);
    const now = ctx.currentTime + 0.045;
    const startBeat = Math.max(fromBeat, nextAudioBeatRef.current);
    const endBeat = Math.min(totalBeats, startBeat + 8);
    for (let clickBeat = Math.max(Math.floor(startBeat), nextClickBeatRef.current); clickBeat < Math.ceil(endBeat); clickBeat += 1) {
      const startDelay = Math.max(0, clickBeat - visualBeat) * beatSeconds;
      playMetronomeClick(ctx, now + startDelay, clickBeat % 4 === 0);
      nextClickBeatRef.current = clickBeat + 1;
    }
    drill.notes.forEach((midi, index) => {
      const noteStart = index * drill.beats;
      if (noteStart < startBeat || noteStart >= endBeat) return;
      const startDelay = Math.max(0, noteStart - visualBeat) * beatSeconds;
      const endDelay = Math.max(startDelay + 0.55, (noteStart + drill.beats - visualBeat) * beatSeconds);
      void playPianoSample(ctx, midi, now + startDelay, now + endDelay, 0.94);
    });
    nextAudioBeatRef.current = endBeat;
  }
  async function startTraining() {
    stopAll();
    setStage('training');
    setPlaying(false);
    setPaused(false);
    setControlsOpen(false);
    setCurrentBeat(0);
    setVoice({ midi: null, cents: null, feedback: 'Prepare-se' });
    scoreRef.current = { hitFrames: 0, missFrames: 0, counted: new Set<number>() };
    await startMic();
    const ctx = getAudioContext();
    if (!ctx) return;
    await ctx.resume().catch(() => null);
    void preloadPianoSamples(ctx, drill.notes);
    const beatMs = beatSeconds * 1000;
    [4, 3, 2, 1].forEach((value, i) => timersRef.current.push(window.setTimeout(() => { setCount(value); playMetronomeClick(ctx, ctx.currentTime + 0.015, value === 1); }, i * beatMs)));
    timersRef.current.push(window.setTimeout(() => {
      setCount(null);
      lastFrameRef.current = performance.now();
      nextAudioBeatRef.current = 0;
      nextClickBeatRef.current = 0;
      scheduleAudio(0, 0);
      setPlaying(true);
      tick();
    }, 4 * beatMs));
  }
  function pauseTraining() {
    if (!playing || stage === 'finished') return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopPianoSamples(audioCtxRef.current ?? undefined);
    setPaused(true);
    setPlaying(false);
    setVoice((old) => ({ ...old, feedback: 'Pausado' }));
  }
  function resumeTraining() {
    if (stage !== 'training' || !paused) return;
    setPaused(false);
    setPlaying(true);
    nextAudioBeatRef.current = currentBeat;
    nextClickBeatRef.current = Math.floor(currentBeat);
    lastFrameRef.current = performance.now();
    scheduleAudio(currentBeat, currentBeat);
    tick();
  }
  function restartTraining() {
    void startTraining();
  }
  function adjustBpm(delta: number) {
    setBpmOffset((value) => clamp(value + delta, -20, 20));
  }
  function tick() {
    const now = performance.now();
    const last = lastFrameRef.current ?? now;
    const delta = Math.min(0.08, Math.max(0, (now - last) / 1000));
    lastFrameRef.current = now;
    setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
    setCurrentBeat((old) => {
      const next = old + delta / beatSeconds;
      scheduleAudio(Math.max(0, old - 0.08), next);
      const noteIndex = Math.floor(old / drill.beats);
      if (!scoreRef.current.counted.has(noteIndex) && old % drill.beats > drill.beats * 0.72) {
        scoreRef.current.counted.add(noteIndex);
        const ok = scoreRef.current.hitFrames >= scoreRef.current.missFrames;
        if (ok) setHits((value) => value + 1); else setMisses((value) => value + 1);
        scoreRef.current.hitFrames = 0;
        scoreRef.current.missFrames = 0;
      }
      if (next >= totalBeats) {
        setPlaying(false);
        setCurrentBeat(totalBeats);
        setStage('finished');
        return totalBeats;
      }
      return next;
    });
    rafRef.current = requestAnimationFrame(tick);
  }
  function nextDrill() {
    if (drillIndex >= drills.length - 1) {
      const total = Math.max(1, hits + misses);
      const summary = { exercise: step.exerciseNumber, correct: hits, wrong: misses, total, avgCents: null, durationSeconds: Math.max(1, seconds), savedAt: Date.now() };
      try { sessionStorage.setItem('daily-melodic-control-summary', JSON.stringify(summary)); localStorage.setItem('daily-melodic-control-summary', JSON.stringify(summary)); } catch {}
      completeDailyStep(step, Math.max(1, seconds));
      router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
      return;
    }
    setDrillIndex((value) => value + 1);
    setStage('intro');
    setCurrentBeat(0);
  }
  const voiceY = yFromMidi(voice.midi);
  const cssVars = { '--voice-y': `${voiceY}%`, '--voice-visible': voice.midi == null ? '0' : '1', '--progress': `${progress}%` } as CSSProperties;

  if (stage === 'intro') {
    return (
      <section className="melodic-intro">
        <Link className="melodic-exit" href="/aluno/central/diarios">Sair</Link><strong className="melodic-level">Iniciante</strong><button className="melodic-info" type="button">i</button>
        <div className="melodic-medal"><span>♛</span><b>◇</b></div>
        <div className="melodic-card">
          <span>ATIVIDADE 4</span>
          <h1>Controle de Altura</h1>
          <p>{drill.title}</p>
          <small>{drill.subtitle}</small>
          <div className="melodic-range">Tessitura do treino: <b>{midiToBrazilianNoteName(drill.notes[0])}</b> → <b>{midiToBrazilianNoteName(Math.max(...drill.notes))}</b><br /><small>Pulsação regular com metrônomo: {activeBpm} BPM</small></div>
          <button type="button" onClick={startTraining}>Iniciar exercício {drillIndex + 1}/3</button>
        </div>
      </section>
    );
  }

  return (
    <section className="melodic-player" style={cssVars} onClick={() => setControlsOpen(true)}>
      <div className="melodic-bg" />
      <div className="melodic-top"><Link href="/aluno/central/diarios">←</Link><strong>{drill.title}</strong><span>{secondsToClock(currentBeat * beatSeconds)} / {secondsToClock(totalBeats * beatSeconds)}</span></div>
      <div className="melodic-progress"><i /></div>
      <div className="melodic-stage">
        <div className="melodic-ruler">{SCALE.map((midi) => <span key={midi} className={activeMidi === midi ? 'active' : ''}>{midiToBrazilianNoteName(midi)}</span>)}</div>
        <div className="melodic-lane"><div className="melodic-hit" />{drill.notes.map((midi, index) => {
          const startBeat = index * drill.beats;
          const left = HIT_X + (startBeat - currentBeat) * PX_PER_BEAT;
          const width = Math.max(5, drill.beats * PX_PER_BEAT);
          if (left + width < -8 || left > HIT_X + PREVIEW_BEATS * PX_PER_BEAT) return null;
          return <span key={`${midi}-${index}`} className="melodic-note" style={{ left: `${left}%`, width: `${width}%`, top: `${yFromMidi(midi)}%` }} />;
        })}<div className="melodic-voice"><i /></div></div>
      </div>
      <div className="melodic-syllable">{drill.syllable}</div>
      <div className="melodic-feedback">{stage === 'finished' ? 'Exercício concluído' : voice.feedback}</div>
      {count ? <div className="melodic-count">{count}</div> : null}
      {controlsOpen && stage !== 'finished' ? (
        <div className="melodic-controls" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={paused ? resumeTraining : pauseTraining}>{paused ? '▶ Continuar' : '⏸ Pausar'}</button>
          <button type="button" onClick={() => adjustBpm(-4)}>− BPM</button>
          <strong>{activeBpm} BPM</strong>
          <button type="button" onClick={() => adjustBpm(4)}>+ BPM</button>
          <button type="button" onClick={restartTraining}>↻ Reiniciar</button>
          <button type="button" onClick={() => setControlsOpen(false)}>×</button>
        </div>
      ) : null}
      {stage === 'finished' ? <div className="melodic-finished"><b>{hits}</b> acertos · <b>{misses}</b> ajustes<button type="button" onClick={nextDrill}>{drillIndex >= drills.length - 1 ? 'Concluir atividade' : 'Próximo exercício'}</button></div> : null}
    </section>
  );
}
