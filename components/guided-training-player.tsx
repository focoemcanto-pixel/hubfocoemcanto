'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise, TrainingNote } from '@/lib/training-center';
import { WireframeBody } from '@/components/vocal/wireframe-body';
import { autoCorrelate, getVocalRegister, midiToBrazilianNoteName, noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';

const MIN_MIDI = 12;
const MAX_MIDI = 84;
const HIT_X = 15;
const PX_PER_BEAT = 10;
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
  const [tuner, setTuner] = useState<Tuner>({ midi: null, cents: null, feedback: 'Toque para iniciar' });
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
  useEffect(() => { if (autoStart && !didAutoStartRef.current) { didAutoStartRef.current = true; const id = window.setTimeout(() => { void startPlayback(); }, 120); return () => window.clearTimeout(id); } }, [autoStart]);

  useEffect(() => {
    if (!playing) return;
    lastFrameRef.current = null;
    const tick = (now: number) => {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const deltaSeconds = (now - lastFrameRef.current) / 1000;
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
      const context = new Ctor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.12;
      source.connect(analyser);
      micCtxRef.current = context;
      streamRef.current = stream;
      setMicReady(true);
      listen(analyser, context);
    } catch { setTuner((old) => ({ ...old, feedback: 'Permita o microfone' })); }
  }
  function stopMic() { if (micRafRef.current) cancelAnimationFrame(micRafRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); micCtxRef.current?.close().catch(() => null); streamRef.current = null; micCtxRef.current = null; setMicReady(false); }
  function listen(analyser: AnalyserNode, context: AudioContext) {
    const buffer = new Float32Array(analyser.fftSize);
    const loopPitch = () => {
      analyser.getFloatTimeDomainData(buffer);
      const frequency = autoCorrelate(buffer, context.sampleRate);
      if (!frequency) {
        silenceRef.current += 1;
        if (silenceRef.current > 8) { setTuner((old) => ({ ...old, midi: null, cents: null, feedback: micReady ? 'Cante próximo ao microfone' : 'Aguardando voz' })); setVoiceTrail((old) => old.slice(-3)); }
      } else {
        silenceRef.current = 0;
        const liveMidi = floatMidiFromFrequency(frequency);
        const target = targetMidiRef.current;
        const cents = target == null ? null : (liveMidi - target) * 100;
        const y = yFromMidi(liveMidi);
        trailTickRef.current += 1;
        setVoiceTrail((old) => [...old.slice(-5), { id: Date.now(), y, wobble: (trailTickRef.current % 7) - 3 }]);
        setTuner({ midi: liveMidi, cents, feedback: cents == null ? 'Aguardando nota' : Math.abs(cents) <= 28 ? 'Perfeito' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' });
      }
      micRafRef.current = requestAnimationFrame(loopPitch);
    };
    loopPitch();
  }
  function targetStyle(note: BeatNote): CSSProperties | null { if (note.mode === 'guide' || note.midi == null) return null; const left = HIT_X + (note.startBeat - currentBeat) * PX_PER_BEAT; const width = Math.max(5, note.durationBeats * PX_PER_BEAT); if (left + width < -6 || left > HIT_X + PREVIEW_BEATS * PX_PER_BEAT) return null; return { left: `${left}%`, width: `${width}%`, top: `${yFromMidi(note.midi)}%` }; }

  return (
    <section className={`exercise-experience ${controls ? 'controls-on' : ''}`} style={cssVars} onPointerDown={showControls}>
      <style>{css}</style><div className="exercise-bg" />
      <div className="exercise-body" aria-hidden="true"><WireframeBody activeRegion={getVocalRegister(activeMidi)} currentMidi={activeMidi} currentLabel={activeMidi != null ? midiToBrazilianNoteName(activeMidi) : undefined} /></div>
      <div className="scale-stage">
        <div className="pitch-ruler">{SCALE.map((midi) => { const inRange = midi >= DEFAULT_LOW && midi <= DEFAULT_HIGH; const isOctave = midi % 12 === 0; const isActive = activeMidi != null && Math.round(activeMidi) === midi; return <span className={`${inRange ? 'in-range' : ''} ${isOctave ? 'octave' : ''} ${isActive ? 'active' : ''}`} key={midi}>{midiToBrazilianNoteName(midi)}</span>; })}</div>
        <div className="timeline-layer"><div className="hit-line" />{beatNotes.map((note, index) => { const style = targetStyle(note); return style ? <span className="target-note" key={`${note.pitch}-${index}`} style={style} /> : null; })}<div className="voice-trail" aria-hidden="true">{voiceTrail.map((point, index) => { const age = voiceTrail.length - index; return <span key={point.id} style={{ left: `${HIT_X - age * 1.45}%`, top: `${point.y}%`, width: `${Math.max(1.2, 3.8 - age * 0.42)}%`, opacity: Math.max(0.01, 0.72 - age * 0.13), transform: `translateY(-50%) rotate(${point.wobble * 0.65}deg)` }} />; })}</div><div className="voice-brush"><i /></div></div>
      </div>
      <div className="minimal-top"><strong>{exercise.title}</strong><span>{formatTime(currentSeconds)} / {formatTime(durationSeconds)}</span></div>
      <div className="progress-line"><i style={{ width: `${progress}%` }} /></div>
      <div className={`feedback-text ${tuner.feedback === 'Perfeito' ? 'good' : ''}`}>{tuner.feedback}</div>
      <div className="execution-label">{executionLabel}</div>
      {count ? <div className="countdown"><b>{count}</b></div> : null}
      <div className="control-overlay" onPointerDown={(event) => event.stopPropagation()}><button className="back-btn" type="button" onClick={() => history.back()}>←</button><div className="bpm-control"><button type="button" onClick={() => adjustBpm(-2)}>−</button><span><b>{bpm}</b><small>BPM</small></span><button type="button" onClick={() => adjustBpm(2)}>+</button></div><div className="control-row"><button type="button" onClick={restart}>↺<span>Reiniciar</span></button><button className="main-btn" type="button" onClick={startPlayback}>{playing ? 'Ⅱ' : count ? '×' : '▶'}<span>{playing ? 'Pausar' : count ? 'Cancelar' : 'Iniciar'}</span></button><button type="button" onClick={() => setLoop((value) => !value)}>∞<span>{loop ? 'Loop' : 'Único'}</span></button></div></div>
    </section>
  );
}

const css = `.exercise-experience{position:relative;min-height:100dvh;overflow:hidden;color:#fff;background:#050607;touch-action:manipulation;isolation:isolate}.exercise-bg{position:absolute;inset:0;background:radial-gradient(circle at 64% 40%,rgba(112,232,255,.11),transparent 28%),radial-gradient(circle at 54% 58%,rgba(245,199,107,.10),transparent 28%),linear-gradient(180deg,#121419 0%,#050608 62%,#020304 100%)}.exercise-bg:after{content:'';position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(255,255,255,.038) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px);background-size:12.5vw 100%,100% 7.2vh;mask-image:linear-gradient(90deg,rgba(0,0,0,.70),#000 24%,#000 82%,rgba(0,0,0,.30))}.exercise-body{position:absolute;z-index:3;left:31%;right:7%;top:24%;bottom:7%;opacity:.42;filter:drop-shadow(0 0 34px rgba(255,255,255,.05));pointer-events:none}.exercise-body svg,.exercise-body canvas{width:100%;height:100%;object-fit:contain}.scale-stage{position:absolute;inset:8.6dvh 0 10.8dvh 0;z-index:5}.pitch-ruler{position:absolute;left:4px;top:0;bottom:0;width:56px;display:flex;flex-direction:column;justify-content:space-between;font-size:clamp(5px,.70dvh,9px);font-weight:850;color:rgba(255,255,255,.20);line-height:1}.pitch-ruler span{position:relative}.pitch-ruler span:after{content:'';position:absolute;left:25px;top:50%;width:19px;height:1px;background:rgba(255,255,255,.10)}.pitch-ruler .in-range{color:rgba(245,199,107,.64)}.pitch-ruler .active{color:#ff3131!important;font-size:1.35em;text-shadow:0 0 14px rgba(255,49,49,.85)}.timeline-layer{position:absolute;left:57px;right:0;top:0;bottom:0;overflow:hidden}.hit-line{position:absolute;left:15%;top:0;bottom:0;width:1px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.34) 18%,rgba(255,255,255,.34) 78%,transparent);z-index:2}.target-note{position:absolute;height:clamp(7px,.95dvh,12px);border-radius:999px;background:rgba(255,255,255,.78);box-shadow:0 0 16px rgba(255,255,255,.24);transform:translateY(-50%);z-index:4}.voice-trail{position:absolute;inset:0;z-index:7;pointer-events:none}.voice-trail span{position:absolute;height:10px;border-radius:999px;background:linear-gradient(90deg,rgba(255,66,66,0),rgba(255,65,65,.86),rgba(255,255,255,.74));box-shadow:0 0 18px rgba(255,0,0,.68)}.voice-brush{position:absolute;left:15%;top:var(--voice-y);width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,#ffd7d7 0 18%,#ff2020 46%,rgba(255,0,0,.32) 72%,transparent 100%);filter:drop-shadow(0 0 16px rgba(255,0,0,.95));transform:translate(-50%,-50%);opacity:var(--voice-visible);transition:top .07s linear,opacity .12s ease;z-index:8}.voice-brush i{position:absolute;inset:5px;border-radius:inherit;background:#fff}.minimal-top{position:absolute;left:64px;right:20px;top:2.2dvh;z-index:10;text-align:center;opacity:.72;pointer-events:none}.minimal-top strong{display:block;font-size:clamp(13px,1.9dvh,18px);font-weight:900;letter-spacing:.12em}.minimal-top span{display:block;margin-top:3px;font-size:11px;color:rgba(255,255,255,.52)}.progress-line{position:absolute;left:72px;right:48px;top:7.2dvh;height:3px;border-radius:999px;background:rgba(255,255,255,.16);z-index:10;overflow:hidden}.progress-line i{display:block;height:100%;border-radius:inherit;background:rgba(255,255,255,.72)}.feedback-text{position:absolute;left:80px;right:30px;top:43%;z-index:9;text-align:center;color:#74ff91;font-size:clamp(16px,2.5dvh,24px);font-weight:950;text-shadow:0 0 18px rgba(116,255,145,.38);pointer-events:none}.feedback-text.good{color:#6bff7a}.execution-label{position:absolute;left:24px;right:24px;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 42px);z-index:11;text-align:center;font-size:clamp(28px,7vw,58px);font-weight:950;color:rgba(255,255,255,.88);text-shadow:0 0 26px rgba(255,255,255,.18);pointer-events:none}.control-overlay{position:absolute;inset:0;z-index:20;opacity:0;pointer-events:none;transition:opacity .25s ease;background:linear-gradient(180deg,rgba(0,0,0,.18),transparent 35%,transparent 52%,rgba(0,0,0,.52))}.controls-on .control-overlay{opacity:1;pointer-events:auto}.back-btn{position:absolute;left:18px;top:2.2dvh;width:44px;height:44px;border:1px solid rgba(255,255,255,.08);border-radius:50%;background:rgba(255,255,255,.06);color:#fff;font-size:24px;backdrop-filter:blur(14px)}.bpm-control{position:absolute;left:50%;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 118px);transform:translateX(-50%);display:flex;align-items:center;gap:18px;color:#fff}.bpm-control button{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#fff;font-size:24px;backdrop-filter:blur(14px)}.bpm-control span{display:grid;place-items:center;min-width:78px}.bpm-control b{font-size:28px;line-height:1}.bpm-control small{font-size:10px;letter-spacing:.18em;color:rgba(255,255,255,.58)}.control-row{position:absolute;left:24px;right:24px;bottom:max(18px,env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr 1.2fr 1fr;align-items:end;gap:18px}.control-row button{border:0;background:transparent;color:#fff;font-weight:700;padding:0;display:grid;place-items:center;gap:8px;font-size:38px;text-shadow:0 0 22px rgba(255,255,255,.2)}.control-row button span{font-size:13px;font-weight:500;color:rgba(255,255,255,.76);text-shadow:none}.control-row .main-btn{width:86px;height:86px;justify-self:center;border:2px solid rgba(255,255,255,.86);border-radius:50%;font-size:42px;background:rgba(255,255,255,.025);backdrop-filter:blur(12px)}.control-row .main-btn span{position:absolute;top:94px}.countdown{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.5);backdrop-filter:blur(10px);z-index:30}.countdown b{font-size:110px;color:#f5c76b;text-shadow:0 0 50px rgba(245,199,107,.8)}@media(max-height:760px){.scale-stage{inset:8dvh 0 10dvh 0}.feedback-text{top:41%}.bpm-control{bottom:calc(max(12px,env(safe-area-inset-bottom)) + 102px)}.control-row .main-btn{width:76px;height:76px}.control-row .main-btn span{top:84px}.execution-label{bottom:calc(max(12px,env(safe-area-inset-bottom)) + 36px);font-size:clamp(25px,6.6vw,50px)}}`;
