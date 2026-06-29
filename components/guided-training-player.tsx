'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise, TrainingNote } from '@/lib/training-center';
import { autoCorrelate, midiToBrazilianNoteName, noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';

const MIN_MIDI = 26;
const MAX_MIDI = 86;
const HIT_X = 14;
const PX_PER_BEAT = 10.3;
const PREVIEW_BEATS = 10;
const AUDIO_LOOKAHEAD_BEATS = 10;
const DEFAULT_LOW = noteNameToMidi('C3') ?? 48;
const DEFAULT_HIGH = noteNameToMidi('C5') ?? 72;
const SCALE = Array.from({ length: MAX_MIDI - MIN_MIDI + 1 }, (_, i) => MAX_MIDI - i);

type AudioCtor = typeof AudioContext;
type WinAudio = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type Tuner = { midi: number | null; cents: number | null; feedback: string };
type BeatNote = TrainingNote & { startBeat: number; durationBeats: number; endBeat: number; midi: number | null };
type TrailPoint = { id: number; y: number; wobble: number };
type Vars = CSSProperties & { '--voice-y': string; '--voice-visible': string; '--progress': string };

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function yFromMidi(midi: number | null) { if (midi == null) return 50; const safe = clamp(midi, MIN_MIDI, MAX_MIDI); return 100 - ((safe - MIN_MIDI) / (MAX_MIDI - MIN_MIDI)) * 100; }
function floatMidiFromFrequency(frequency: number) { return 69 + 12 * Math.log2(frequency / 440); }
function formatTime(seconds: number) { const safe = Math.max(0, Math.floor(seconds)); return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`; }
function buildBeatNotes(exercise: TrainingExercise): BeatNote[] { const originalBeatSeconds = 60 / exercise.bpm; return exercise.notes.map((note) => { const startBeat = note.start / originalBeatSeconds; const durationBeats = note.duration / originalBeatSeconds; return { ...note, startBeat, durationBeats, endBeat: startBeat + durationBeats, midi: noteNameToMidi(note.pitch) }; }); }

export function GuidedTrainingPlayer({ exercise, autoStart = false }: { exercise: TrainingExercise; compact?: boolean; autoStart?: boolean }) {
  const [currentBeat, setCurrentBeat] = useState(0);
  const [bpm, setBpm] = useState(exercise.bpm);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const [controls, setControls] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [tuner, setTuner] = useState<Tuner>({ midi: null, cents: null, feedback: 'Aguardando voz' });
  const [voiceTrail, setVoiceTrail] = useState<TrailPoint[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const micRafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const currentBeatRef = useRef(0);
  const silenceRef = useRef(0);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const timersRef = useRef<number[]>([]);
  const targetMidiRef = useRef<number | null>(null);
  const trailTickRef = useRef(0);
  const nextAudioBeatRef = useRef(0);
  const audioAnchorRef = useRef<number | null>(null);
  const didAutoStartRef = useRef(false);
  const voiceBrushRef = useRef<HTMLDivElement | null>(null);

  const beatNotes = useMemo(() => buildBeatNotes(exercise), [exercise]);
  const totalBeats = useMemo(() => Math.max(...beatNotes.map((note) => note.endBeat), 0), [beatNotes]);
  const beatSeconds = 60 / bpm;
  const currentSeconds = currentBeat * beatSeconds;
  const durationSeconds = totalBeats * beatSeconds;
  const activeNote = beatNotes.find((note) => note.mode !== 'guide' && currentBeat >= note.startBeat && currentBeat <= note.endBeat);
  const activeMidi = activeNote?.midi ?? null;
  const executionLabel = activeNote?.label || beatNotes.find((note) => note.label && note.mode !== 'guide')?.label || 'Cante junto';
  const progress = totalBeats ? Math.min(100, (currentBeat / totalBeats) * 100) : 0;
  const voiceY = yFromMidi(tuner.midi);
  const cssVars = { '--voice-y': `${voiceY}%`, '--voice-visible': tuner.midi == null ? '0' : '1', '--progress': String(progress) } as Vars;

  targetMidiRef.current = activeMidi;
  currentBeatRef.current = currentBeat;

  useEffect(() => () => { stopAudio(); stopMic(); }, []);
  useLayoutEffect(() => { if (autoStart && !didAutoStartRef.current) { didAutoStartRef.current = true; void startPlayback(); } }, [autoStart]);

  useEffect(() => {
    if (!playing) return;
    lastFrameRef.current = null;
    const tick = (now: number) => {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const deltaSeconds = Math.min(0.08, Math.max(0, (now - lastFrameRef.current) / 1000));
      lastFrameRef.current = now;
      setCurrentBeat((old) => {
        const next = old + deltaSeconds * (bpm / 60);
        scheduleAudioWindow(Math.max(0, old - 0.1), Math.min(totalBeats, next + AUDIO_LOOKAHEAD_BEATS));
        if (next >= totalBeats) {
          setVoiceTrail([]);
          stopAudio(false);
          if (!loop) { setPlaying(false); return totalBeats; }
          const context = getAudioContext();
          if (context) audioAnchorRef.current = context.currentTime + 0.03;
          nextAudioBeatRef.current = 0;
          scheduleAudioWindow(0, AUDIO_LOOKAHEAD_BEATS);
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, totalBeats, bpm, loop]);

  useEffect(() => {
    if (!playing) return;
    const context = getAudioContext();
    if (!context) return;
    stopAudio(false);
    audioAnchorRef.current = context.currentTime - currentBeatRef.current * beatSeconds;
    nextAudioBeatRef.current = currentBeatRef.current;
    scheduleAudioWindow(currentBeatRef.current, currentBeatRef.current + AUDIO_LOOKAHEAD_BEATS);
  }, [bpm]);

  useEffect(() => { if (!playing || !controls) return; const id = window.setTimeout(() => setControls(false), 2600); return () => window.clearTimeout(id); }, [playing, controls]);

  function showControls() { setControls(true); }
  function getAudioContext() { if (typeof window === 'undefined') return null; if (!audioCtxRef.current) { const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext; audioCtxRef.current = Ctor ? new Ctor() : null; } return audioCtxRef.current; }
  function stopAudio(clearCount = true) { timersRef.current.forEach(clearTimeout); timersRef.current = []; stopPianoSamples(audioCtxRef.current ?? undefined); oscillatorsRef.current.forEach((osc) => { try { osc.stop(); } catch {} }); oscillatorsRef.current = []; if (clearCount) setCount(null); }

  function playClick(context: AudioContext, at: number, strong = false) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = strong ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.1 : 0.055, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.07);
    oscillatorsRef.current.push(oscillator);
  }

  function scheduleAudioWindow(fromBeat: number, toBeat: number) {
    const context = getAudioContext();
    const anchor = audioAnchorRef.current;
    if (!context || anchor == null || toBeat <= nextAudioBeatRef.current) return;
    context.resume().catch(() => null);
    const secondsPerBeat = 60 / bpm;
    const now = context.currentTime;
    const startBeat = Math.max(fromBeat, nextAudioBeatRef.current);
    const endBeat = Math.min(toBeat, totalBeats);
    for (let beatIndex = Math.max(0, Math.ceil(startBeat)); beatIndex < endBeat; beatIndex += 1) {
      const at = anchor + beatIndex * secondsPerBeat;
      if (at > now + 0.015) playClick(context, at, beatIndex % 4 === 0);
    }
    beatNotes.forEach((note) => {
      if (note.midi == null || note.startBeat < startBeat || note.startBeat >= endBeat) return;
      const startAt = anchor + note.startBeat * secondsPerBeat;
      const endAt = anchor + note.endBeat * secondsPerBeat;
      if (endAt <= now + 0.02) return;
      void playPianoSample(context, note.midi, Math.max(now + 0.015, startAt), Math.max(now + 0.24, endAt), note.mode === 'guide' ? 0.86 : 1.02);
    });
    nextAudioBeatRef.current = endBeat;
  }

  async function startPlayback() {
    if (playing || count) { stopAudio(); setPlaying(false); setControls(true); setVoiceTrail([]); return; }
    void startMic();
    const context = getAudioContext();
    if (!context) { setPlaying(true); return; }
    await context.resume().catch(() => null);
    stopAudio();
    setVoiceTrail([]);
    const start = currentBeat >= totalBeats ? 0 : currentBeat;
    const upcoming = beatNotes.filter((note) => note.midi != null && note.startBeat >= start && note.startBeat <= start + 36).map((note) => note.midi as number);
    void preloadPianoSamples(context, upcoming);
    const beatMs = (60 / bpm) * 1000;
    [4, 3, 2, 1].forEach((value, index) => timersRef.current.push(window.setTimeout(() => { setCount(value); playClick(context, context.currentTime + 0.01, value === 4); }, index * beatMs)));
    timersRef.current.push(window.setTimeout(() => { setCount(null); setCurrentBeat(start); audioAnchorRef.current = context.currentTime - start * (60 / bpm) + 0.03; nextAudioBeatRef.current = start; scheduleAudioWindow(start, start + AUDIO_LOOKAHEAD_BEATS); setPlaying(true); }, 4 * beatMs));
  }

  function adjustBpm(delta: number) { setBpm((old) => clamp(old + delta, 48, 140)); setControls(true); }
  function restart() { stopAudio(); setPlaying(false); setCurrentBeat(0); setVoiceTrail([]); setControls(true); audioAnchorRef.current = null; nextAudioBeatRef.current = 0; }

  async function startMic() {
    if (micCtxRef.current || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      if (!Ctor) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const context = new Ctor({ latencyHint: 'interactive' });
      await context.resume().catch(() => null);
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      micCtxRef.current = context;
      streamRef.current = stream;
      setMicReady(true);
      listen(analyser, context);
    } catch { setTuner((old) => ({ ...old, feedback: 'Permita o microfone' })); }
  }
  function stopMic() { if (micRafRef.current) cancelAnimationFrame(micRafRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); micCtxRef.current?.close().catch(() => null); streamRef.current = null; micCtxRef.current = null; setMicReady(false); }
  function moveBrush(y: number | null) { const el = voiceBrushRef.current; if (!el) return; if (y == null) { el.style.opacity = '0'; return; } el.style.opacity = '1'; el.style.top = `${y}%`; }
  function listen(analyser: AnalyserNode, context: AudioContext) {
    const buffer = new Float32Array(analyser.fftSize);
    let lastUi = 0;
    const loopPitch = () => {
      analyser.getFloatTimeDomainData(buffer);
      const frequency = autoCorrelate(buffer, context.sampleRate);
      const now = performance.now();
      if (!frequency) {
        silenceRef.current += 1;
        if (silenceRef.current > 5) { moveBrush(null); if (now - lastUi > 80) { lastUi = now; setTuner((old) => ({ ...old, midi: null, cents: null, feedback: micReady ? 'Cante próximo ao microfone' : 'Aguardando voz' })); setVoiceTrail((old) => old.slice(-3)); } }
      } else {
        silenceRef.current = 0;
        const liveMidi = floatMidiFromFrequency(frequency);
        const target = targetMidiRef.current;
        const cents = target == null ? null : (liveMidi - target) * 100;
        const y = yFromMidi(liveMidi);
        moveBrush(y);
        trailTickRef.current += 1;
        if (now - lastUi > 38) {
          lastUi = now;
          setVoiceTrail((old) => [...old.slice(-5), { id: Date.now(), y, wobble: (trailTickRef.current % 7) - 3 }]);
          setTuner({ midi: liveMidi, cents, feedback: cents == null ? 'Aguardando nota' : Math.abs(cents) <= 28 ? 'Perfeito' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' });
        }
      }
      micRafRef.current = requestAnimationFrame(loopPitch);
    };
    loopPitch();
  }
  function targetStyle(note: BeatNote): CSSProperties | null { if (note.mode === 'guide' || note.midi == null) return null; const left = HIT_X + (note.startBeat - currentBeat) * PX_PER_BEAT; const width = Math.max(5.2, note.durationBeats * PX_PER_BEAT); if (left + width < -6 || left > HIT_X + PREVIEW_BEATS * PX_PER_BEAT) return null; return { left: `${left}%`, width: `${width}%`, top: `${yFromMidi(note.midi)}%` }; }

  return (
    <section className={`exercise-experience ${controls ? 'controls-on' : ''}`} style={cssVars} onPointerDown={showControls}>
      <style>{css}</style>
      <div className="exercise-card-frame" />
      <div className="exercise-bg" />
      <header className="premium-head"><span><i />Exercício vocal</span><b>★</b></header>
      <div className="title-block"><h1>{exercise.title}</h1><p>Controle • Precisão • Apoio</p><small>{formatTime(currentSeconds)} / {formatTime(durationSeconds)}</small></div>
      <div className="progress-line"><i style={{ width: `${progress}%` }} /></div>
      <div className="exercise-body" aria-hidden="true"><img src="/vocal/vocal-body-base.png" alt="" /><span /></div>
      <div className="wave-glow" aria-hidden="true" />
      <div className="scale-stage">
        <div className="pitch-ruler">{SCALE.map((midi) => { const inRange = midi >= DEFAULT_LOW && midi <= DEFAULT_HIGH; const isActive = activeMidi != null && Math.round(activeMidi) === midi; return <span className={`${inRange ? 'in-range' : ''} ${isActive ? 'active' : ''}`} key={midi}>{midiToBrazilianNoteName(midi)}</span>; })}</div>
        <div className="timeline-layer"><div className="hit-line"><i /><b /></div>{beatNotes.map((note, index) => { const style = targetStyle(note); return style ? <span className="target-note" key={`${note.pitch}-${index}`} style={style} /> : null; })}<div className="voice-trail" aria-hidden="true">{voiceTrail.map((point, index) => { const age = voiceTrail.length - index; return <span key={point.id} style={{ left: `${HIT_X - age * 1.35}%`, top: `${point.y}%`, width: `${Math.max(1.2, 3.8 - age * 0.42)}%`, opacity: Math.max(0.01, 0.72 - age * 0.13), transform: `translateY(-50%) rotate(${point.wobble * 0.65}deg)` }} />; })}</div><div className="voice-brush" ref={voiceBrushRef}><i /></div></div>
      </div>
      <div className={`feedback-text ${tuner.feedback === 'Perfeito' ? 'good' : ''}`}>{tuner.feedback}</div>
      <div className="execution-label">{executionLabel}</div>
      {count ? <div className="countdown"><b>{count}</b></div> : null}
      <div className="control-overlay" onPointerDown={(event) => event.stopPropagation()}><div className="control-card"><button type="button" onClick={startPlayback}><span>▶</span><small>Ouvir base</small></button><button className="main-btn" type="button" onClick={startPlayback}><span>{playing ? 'Ⅱ' : count ? '×' : '🎙'}</span><strong>{playing ? 'Pausar exercício' : count ? 'Cancelar' : 'Iniciar exercício'}</strong><small>{playing ? 'Toque para pausar' : 'Toque para começar'}</small></button><button type="button" onClick={restart}><span>↻</span><small>Repetir exercício</small></button></div><div className="tip-card"><b>💡</b><p>Mantenha a boca fechada e o ar fluindo pelo nariz.<br /><span>Foco no apoio, na ressonância e na constância do som.</span></p></div><div className="bpm-control"><button type="button" onClick={() => adjustBpm(-2)}>−</button><span><b>{bpm}</b><small>BPM</small></span><button type="button" onClick={() => adjustBpm(2)}>+</button></div><button className="back-btn" type="button" onClick={() => history.back()}>‹</button></div>
    </section>
  );
}

const css = `.exercise-experience{position:relative;min-height:100dvh;overflow:hidden;color:#fff;background:#050607;touch-action:manipulation;isolation:isolate;padding:22px 20px 18px}.exercise-card-frame{position:absolute;inset:8px 2px 10px;border:1px solid rgba(245,199,107,.18);border-radius:30px;box-shadow:inset 0 0 60px rgba(245,199,107,.05);pointer-events:none;z-index:1}.exercise-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 55%,rgba(245,199,107,.12),transparent 28%),radial-gradient(circle at 54% 42%,rgba(255,255,255,.055),transparent 22%),linear-gradient(180deg,#101318 0%,#050608 58%,#020304 100%);z-index:0}.exercise-bg:after{content:'';position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px);background-size:12.5vw 100%,100% 7.2vh;mask-image:linear-gradient(90deg,rgba(0,0,0,.65),#000 20%,#000 86%,rgba(0,0,0,.40))}.premium-head{position:absolute;left:34px;right:34px;top:24px;z-index:20;display:flex;align-items:center;justify-content:space-between;text-transform:uppercase;letter-spacing:.10em;font-weight:850;color:#f5c76b;font-size:14px}.premium-head span{display:flex;align-items:center;gap:10px}.premium-head i{width:22px;height:22px;display:inline-block;background:linear-gradient(90deg,transparent 0 12%,#f5c76b 12% 18%,transparent 18% 30%,#f5c76b 30% 40%,transparent 40% 56%,#f5c76b 56% 66%,transparent 66%);filter:drop-shadow(0 0 8px rgba(245,199,107,.45))}.premium-head b{border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.07);padding:7px 12px;color:#f9db94;letter-spacing:0}.title-block{position:absolute;left:24px;right:24px;top:76px;z-index:18;text-align:center;pointer-events:none}.title-block h1{margin:0;color:#fff;font-size:clamp(32px,6.4vw,52px);line-height:1;font-weight:950;letter-spacing:.015em;text-shadow:0 4px 30px rgba(0,0,0,.44)}.title-block p{margin:12px 0 0;color:#d6a846;font-size:clamp(16px,3.1vw,28px);line-height:1}.title-block small{display:block;margin-top:12px;color:rgba(255,255,255,.62);font-size:15px}.progress-line{position:absolute;left:13%;right:13%;top:174px;height:5px;border-radius:999px;background:rgba(255,255,255,.14);z-index:18;overflow:hidden}.progress-line i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#f7c763,#ffd986)}.exercise-body{position:absolute;z-index:3;left:19%;right:-4%;top:212px;bottom:78px;opacity:.70;filter:drop-shadow(0 0 34px rgba(255,255,255,.05));pointer-events:none;display:grid;place-items:center}.exercise-body img{width:100%;height:100%;object-fit:contain;object-position:center bottom;opacity:.66}.exercise-body span{position:absolute;left:48%;top:49%;width:42%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(245,199,107,.25),rgba(245,199,107,.08) 38%,transparent 73%);filter:blur(2px);opacity:.58;transform:translate(-50%,-50%) scale(.9);animation:bodyPulse 1.4s ease-in-out infinite}.wave-glow{position:absolute;left:17%;right:4%;top:292px;height:100px;z-index:2;opacity:.35;background:repeating-linear-gradient(90deg,transparent 0 8px,rgba(245,199,107,.55) 9px 12px,transparent 13px 20px);mask-image:radial-gradient(ellipse at center,#000 0 24%,rgba(0,0,0,.55) 42%,transparent 80%);filter:blur(.2px) drop-shadow(0 0 20px rgba(245,199,107,.24))}.scale-stage{position:absolute;left:0;right:0;top:208px;bottom:218px;z-index:5}.pitch-ruler{position:absolute;left:35px;top:0;bottom:0;width:56px;display:flex;flex-direction:column;justify-content:space-between;font-size:clamp(8px,1.05dvh,11px);font-weight:750;color:rgba(255,255,255,.50);line-height:1}.pitch-ruler span{position:relative}.pitch-ruler span:after{content:'';position:absolute;left:28px;top:50%;width:32px;height:1px;background:rgba(255,255,255,.16)}.pitch-ruler .in-range{color:rgba(245,199,107,.82)}.pitch-ruler .active{color:#ff3131!important;font-size:1.18em;text-shadow:0 0 14px rgba(255,49,49,.85)}.timeline-layer{position:absolute;left:98px;right:0;top:0;bottom:0;overflow:hidden}.hit-line{position:absolute;left:14%;top:4px;bottom:4px;width:1px;background:linear-gradient(180deg,#f8ce75,#f8ce75);box-shadow:0 0 18px rgba(245,199,107,.50);z-index:2}.hit-line i,.hit-line b{content:'';position:absolute;left:50%;width:13px;height:13px;border-radius:50%;background:#fff2cf;box-shadow:0 0 18px rgba(245,199,107,.75);transform:translateX(-50%)}.hit-line i{top:0}.hit-line b{bottom:0}.target-note{position:absolute;height:clamp(10px,1.45dvh,15px);border-radius:999px;background:linear-gradient(180deg,#fff,#e7e1d5);box-shadow:0 0 16px rgba(255,255,255,.34),0 0 28px rgba(245,199,107,.16);transform:translateY(-50%);z-index:4}.voice-trail{position:absolute;inset:0;z-index:7;pointer-events:none}.voice-trail span{position:absolute;height:12px;border-radius:999px;background:linear-gradient(90deg,rgba(255,66,66,0),rgba(255,65,65,.90),rgba(255,245,225,.82));box-shadow:0 0 18px rgba(255,0,0,.68)}.voice-brush{position:absolute;left:14%;top:var(--voice-y);width:22px;height:22px;border-radius:50%;background:radial-gradient(circle,#ffd7d7 0 18%,#ff2020 46%,rgba(255,0,0,.32) 72%,transparent 100%);filter:drop-shadow(0 0 16px rgba(255,0,0,.95));transform:translate(-50%,-50%);opacity:0;z-index:8;will-change:top,opacity}.voice-brush i{position:absolute;inset:6px;border-radius:inherit;background:#fff}.feedback-text{position:absolute;left:110px;right:30px;top:56%;z-index:9;text-align:center;color:#e4b85d;font-size:clamp(24px,4.5vw,40px);font-weight:950;text-shadow:0 0 22px rgba(245,199,107,.36);pointer-events:none}.feedback-text.good{color:#e4b85d}.execution-label{position:absolute;left:24px;right:24px;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 78px);z-index:11;text-align:center;font-size:clamp(38px,7.5vw,62px);font-weight:950;color:rgba(255,255,255,.9);text-shadow:0 0 26px rgba(255,255,255,.18);pointer-events:none}.control-overlay{position:absolute;inset:0;z-index:30;opacity:0;pointer-events:none;transition:opacity .25s ease;background:linear-gradient(180deg,rgba(0,0,0,.05),transparent 48%,rgba(0,0,0,.70))}.controls-on .control-overlay{opacity:1;pointer-events:auto}.control-card{position:absolute;left:38px;right:38px;bottom:calc(max(28px,env(safe-area-inset-bottom)) + 94px);min-height:112px;border:1px solid rgba(255,255,255,.10);border-radius:24px;background:rgba(8,9,11,.78);backdrop-filter:blur(18px);display:grid;grid-template-columns:1fr 1.55fr 1fr;align-items:center;text-align:center;box-shadow:0 18px 60px rgba(0,0,0,.35)}.control-card button{border:0;background:transparent;color:#fff;display:grid;place-items:center;gap:8px}.control-card button span{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);font-size:24px}.control-card button small{font-size:15px;color:#fff;font-weight:750}.control-card .main-btn span{width:84px;height:84px;background:linear-gradient(180deg,#ffdf83,#e5af43);color:#080808;border:2px solid rgba(255,255,255,.18);box-shadow:0 0 32px rgba(245,199,107,.45);font-size:36px}.control-card .main-btn strong{color:#f5c76b;font-size:18px}.control-card .main-btn small{color:rgba(255,255,255,.62);font-weight:500}.tip-card{position:absolute;left:38px;right:38px;bottom:max(18px,env(safe-area-inset-bottom));min-height:66px;border:1px solid rgba(255,255,255,.10);border-radius:19px;background:rgba(8,9,11,.78);display:grid;grid-template-columns:48px 1fr;gap:12px;align-items:center;padding:12px 18px;color:rgba(255,255,255,.72)}.tip-card b{font-size:26px;color:#f5c76b}.tip-card p{margin:0;font-size:15px;line-height:1.34}.tip-card span{color:#d7a947}.bpm-control{position:absolute;left:50%;bottom:calc(max(28px,env(safe-area-inset-bottom)) + 222px);transform:translateX(-50%);display:flex;align-items:center;gap:16px;color:#fff}.bpm-control button{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#fff;font-size:24px;backdrop-filter:blur(14px)}.bpm-control span{display:grid;place-items:center;min-width:68px}.bpm-control b{font-size:26px;line-height:1}.bpm-control small{font-size:10px;letter-spacing:.18em;color:rgba(255,255,255,.58)}.back-btn{position:absolute;left:22px;bottom:max(18px,env(safe-area-inset-bottom));width:54px;height:54px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.08);color:#fff;font-size:34px}.countdown{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.5);backdrop-filter:blur(10px);z-index:40}.countdown b{font-size:110px;color:#f5c76b;text-shadow:0 0 50px rgba(245,199,107,.8)}@keyframes bodyPulse{0%,100%{opacity:.38;transform:translate(-50%,-50%) scale(.85)}50%{opacity:.72;transform:translate(-50%,-50%) scale(1.05)}}@media(max-height:790px){.title-block{top:64px}.progress-line{top:158px}.scale-stage{top:184px;bottom:186px}.exercise-body{top:188px;bottom:66px}.wave-glow{top:260px}.execution-label{bottom:calc(max(16px,env(safe-area-inset-bottom)) + 60px);font-size:clamp(34px,7vw,54px)}.control-card{bottom:calc(max(24px,env(safe-area-inset-bottom)) + 82px);min-height:102px}.control-card .main-btn span{width:74px;height:74px}.tip-card{display:none}.bpm-control{bottom:calc(max(24px,env(safe-area-inset-bottom)) + 198px)}}@media(max-width:420px){.exercise-experience{padding-left:12px;padding-right:12px}.premium-head{left:24px;right:24px}.title-block h1{font-size:34px}.title-block p{font-size:18px}.scale-stage{bottom:190px}.pitch-ruler{left:28px}.timeline-layer{left:88px}.control-card{left:20px;right:20px}.tip-card{left:20px;right:20px}.feedback-text{left:92px;font-size:30px}.execution-label{font-size:44px}}`;
