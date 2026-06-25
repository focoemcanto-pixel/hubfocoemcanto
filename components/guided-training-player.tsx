'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise, TrainingNote } from '@/lib/training-center';
import { getTrainingDurationSeconds } from '@/lib/training-center';
import { WireframeBody } from '@/components/vocal/wireframe-body';
import { autoCorrelate, frequencyToMidi, getVocalRegister, midiToBrazilianNoteName, midiToFrequency, noteNameToMidi } from '@/lib/audio/pitch';

const MIN_MIDI = 12;
const MAX_MIDI = 84;
const HIT_X = 15;
const PX_PER_SECOND = 12;
const PREVIEW_SECONDS = 8.5;
const DEFAULT_LOW = noteNameToMidi('E3') ?? 52;
const DEFAULT_HIGH = noteNameToMidi('G5') ?? 79;
const SCALE = Array.from({ length: MAX_MIDI - MIN_MIDI + 1 }, (_, i) => MAX_MIDI - i);

type AudioCtor = typeof AudioContext;
type WinAudio = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type Tuner = { midi: number | null; cents: number | null; feedback: string };
type Vars = CSSProperties & { '--voice-y': string; '--voice-visible': string; '--progress': string };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function yFromMidi(midi: number | null) {
  if (midi == null) return 50;
  const safe = clamp(midi, MIN_MIDI, MAX_MIDI);
  return 100 - ((safe - MIN_MIDI) / (MAX_MIDI - MIN_MIDI)) * 100;
}

function normalizeMidiToTarget(midi: number, target: number | null) {
  if (target == null) return midi;
  let next = midi;
  while (next < target - 6) next += 12;
  while (next > target + 6) next -= 12;
  return next;
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

function noteMidi(note: TrainingNote) {
  return noteNameToMidi(note.pitch);
}

export function GuidedTrainingPlayer({ exercise }: { exercise: TrainingExercise; compact?: boolean }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [loop, setLoop] = useState(true);
  const [metro, setMetro] = useState(true);
  const [controls, setControls] = useState(true);
  const [micReady, setMicReady] = useState(false);
  const [tuner, setTuner] = useState<Tuner>({ midi: null, cents: null, feedback: 'Toque para iniciar' });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const micRafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const smoothMidiRef = useRef<number | null>(null);
  const silenceRef = useRef(0);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const timersRef = useRef<number[]>([]);
  const targetMidiRef = useRef<number | null>(null);

  const duration = useMemo(() => getTrainingDurationSeconds(exercise), [exercise]);
  const activeNote = exercise.notes.find((note) => time >= note.start && time <= note.start + note.duration);
  const activeMidi = activeNote ? noteMidi(activeNote) : null;
  const progress = Math.min(100, (time / duration) * 100);
  const voiceY = yFromMidi(tuner.midi);
  const cssVars = { '--voice-y': `${voiceY}%`, '--voice-visible': tuner.midi == null ? '0' : '1', '--progress': String(progress) } as Vars;

  targetMidiRef.current = activeMidi;

  useEffect(() => () => {
    stopAudio();
    stopMic();
  }, []);

  useEffect(() => {
    if (!playing) return;
    lastFrameRef.current = null;
    const tick = (now: number) => {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const delta = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      setTime((old) => {
        const next = old + delta;
        if (next >= duration) {
          if (!loop) {
            setPlaying(false);
            stopAudio();
            return duration;
          }
          stopAudio();
          scheduleAudio(0);
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, duration, loop, metro]);

  useEffect(() => {
    if (!playing || !controls) return;
    const id = window.setTimeout(() => setControls(false), 2600);
    return () => window.clearTimeout(id);
  }, [playing, controls]);

  function showControls() {
    setControls(true);
  }

  function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      audioCtxRef.current = Ctor ? new Ctor() : null;
    }
    return audioCtxRef.current;
  }

  function stopAudio() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    oscillatorsRef.current.forEach((osc) => {
      try { osc.stop(); } catch {}
    });
    oscillatorsRef.current = [];
    setCount(null);
  }

  function playClick(context: AudioContext, at: number, strong = false) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = strong ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.2 : 0.12, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.08);
    oscillatorsRef.current.push(oscillator);
  }

  function playPiano(context: AudioContext, midi: number, at: number, end: number) {
    const frequency = midiToFrequency(midi);
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2500;
    filter.connect(master);
    master.connect(context.destination);
    master.gain.setValueAtTime(0.0001, at);
    master.gain.exponentialRampToValueAtTime(0.32, at + 0.01);
    master.gain.exponentialRampToValueAtTime(0.12, at + 0.18);
    master.gain.exponentialRampToValueAtTime(0.0001, end);
    [1, 2, 3].forEach((ratio) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = ratio === 1 ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency * ratio;
      gain.gain.value = ratio === 1 ? 0.72 : ratio === 2 ? 0.18 : 0.07;
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start(at);
      oscillator.stop(end + 0.04);
      oscillatorsRef.current.push(oscillator);
    });
  }

  function scheduleAudio(from: number) {
    const context = getAudioContext();
    if (!context) return;
    context.resume().catch(() => null);
    const now = context.currentTime + 0.03;
    const beat = 60 / exercise.bpm;
    if (metro) {
      for (let beatIndex = Math.ceil(from / beat); beatIndex * beat <= duration; beatIndex += 1) {
        const beatTime = beatIndex * beat;
        playClick(context, now + Math.max(0, beatTime - from), beatIndex % 4 === 0);
      }
    }
    exercise.notes.forEach((note) => {
      const midi = noteMidi(note);
      if (midi == null || note.start + note.duration <= from) return;
      playPiano(context, midi, now + Math.max(0, note.start - from), now + Math.max(0.18, note.start + note.duration - from));
    });
  }

  async function startPlayback() {
    if (playing || count) {
      stopAudio();
      setPlaying(false);
      setControls(true);
      return;
    }
    await startMic();
    const context = getAudioContext();
    if (!context) {
      setPlaying(true);
      return;
    }
    context.resume().catch(() => null);
    stopAudio();
    const beatMs = (60 / exercise.bpm) * 1000;
    [4, 3, 2, 1].forEach((value, index) => {
      timersRef.current.push(window.setTimeout(() => {
        setCount(value);
        playClick(context, context.currentTime + 0.01, value === 4);
      }, index * beatMs));
    });
    timersRef.current.push(window.setTimeout(() => {
      setCount(null);
      const start = time >= duration ? 0 : time;
      setTime(start);
      scheduleAudio(start);
      setPlaying(true);
    }, 4 * beatMs));
  }

  async function startMic() {
    if (micReady || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const context = new Ctor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);
      micCtxRef.current = context;
      streamRef.current = stream;
      setMicReady(true);
      listen(analyser, context);
    } catch {
      setTuner((old) => ({ ...old, feedback: 'Permita o microfone' }));
    }
  }

  function stopMic() {
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    micCtxRef.current?.close().catch(() => null);
    streamRef.current = null;
    micCtxRef.current = null;
    setMicReady(false);
  }

  function listen(analyser: AnalyserNode, context: AudioContext) {
    const buffer = new Float32Array(analyser.fftSize);
    const loopPitch = () => {
      analyser.getFloatTimeDomainData(buffer);
      const frequency = autoCorrelate(buffer, context.sampleRate);
      const target = targetMidiRef.current;
      if (!frequency) {
        silenceRef.current += 1;
        if (silenceRef.current > 7) setTuner((old) => ({ ...old, cents: null, feedback: 'Cante próximo ao microfone' }));
      } else {
        silenceRef.current = 0;
        let midi = frequencyToMidi(frequency);
        midi = normalizeMidiToTarget(midi, target);
        smoothMidiRef.current = smoothMidiRef.current == null ? midi : smoothMidiRef.current * 0.22 + midi * 0.78;
        const stableMidi = smoothMidiRef.current;
        const cents = target == null ? null : (stableMidi - target) * 100;
        setTuner({
          midi: stableMidi,
          cents,
          feedback: cents == null ? 'Aguardando nota' : Math.abs(cents) <= 28 ? 'Perfeito' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco',
        });
      }
      micRafRef.current = requestAnimationFrame(loopPitch);
    };
    loopPitch();
  }

  function targetStyle(note: TrainingNote): CSSProperties | null {
    const midi = noteMidi(note);
    if (midi == null) return null;
    const left = HIT_X + (note.start - time) * PX_PER_SECOND;
    const width = Math.max(5.5, note.duration * PX_PER_SECOND);
    if (left + width < -6 || left > HIT_X + PREVIEW_SECONDS * PX_PER_SECOND) return null;
    return { left: `${left}%`, width: `${width}%`, top: `${yFromMidi(midi)}%` };
  }

  return (
    <section className={`exercise-experience ${controls ? 'controls-on' : ''}`} style={cssVars} onPointerDown={showControls}>
      <style>{css}</style>
      <div className="exercise-bg" />
      <div className="exercise-body" aria-hidden="true">
        <WireframeBody activeRegion={getVocalRegister(activeMidi)} currentMidi={activeMidi} currentLabel={activeMidi != null ? midiToBrazilianNoteName(activeMidi) : undefined} />
      </div>
      <div className="scale-stage">
        <div className="pitch-ruler">
          {SCALE.map((midi) => {
            const inRange = midi >= DEFAULT_LOW && midi <= DEFAULT_HIGH;
            const isOctave = midi % 12 === 0;
            const isActive = activeMidi != null && Math.round(activeMidi) === midi;
            return <span className={`${inRange ? 'in-range' : ''} ${isOctave ? 'octave' : ''} ${isActive ? 'active' : ''}`} key={midi}>{midiToBrazilianNoteName(midi)}</span>;
          })}
        </div>
        <div className="timeline-layer">
          <div className="hit-line" />
          {exercise.notes.map((note, index) => {
            const style = targetStyle(note);
            return style ? <span className="target-note" key={`${note.pitch}-${index}`} style={style} /> : null;
          })}
          <div className="voice-brush"><i /></div>
        </div>
      </div>
      <div className="minimal-top">
        <strong>{exercise.title}</strong>
        <span>{formatTime(time)} / {formatTime(duration)}</span>
      </div>
      <div className="progress-line"><i style={{ width: `${progress}%` }} /></div>
      <div className="feedback-text">{tuner.feedback}</div>
      {count ? <div className="countdown"><b>{count}</b></div> : null}
      <div className="control-overlay" onPointerDown={(event) => event.stopPropagation()}>
        <button className="back-btn" type="button" onClick={() => history.back()}>←</button>
        <div className="control-row">
          <button className="main-btn" type="button" onClick={startPlayback}>{playing ? 'Pausar' : count ? 'Cancelar' : 'Iniciar'}</button>
          <button type="button" onClick={() => setLoop((value) => !value)}>{loop ? 'Loop' : 'Sem loop'}</button>
          <button type="button" onClick={() => setMetro((value) => !value)}>{metro ? 'Metrônomo' : 'Sem metrônomo'}</button>
        </div>
      </div>
    </section>
  );
}

const css = `.exercise-experience{position:relative;height:100%;min-height:100dvh;overflow:hidden;color:#f8fafc;background:#050607;touch-action:manipulation;isolation:isolate}.exercise-bg{position:absolute;inset:0;background:radial-gradient(circle at 64% 40%,rgba(112,232,255,.11),transparent 28%),radial-gradient(circle at 54% 58%,rgba(245,199,107,.1),transparent 28%),linear-gradient(180deg,#121419 0%,#050608 62%,#020304 100%)}.exercise-bg:after{content:'';position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px);background-size:12.5vw 100%,100% 7.2vh;mask-image:linear-gradient(90deg,rgba(0,0,0,.55),#000 28%,#000 82%,rgba(0,0,0,.25))}.exercise-body{position:absolute;inset:0;z-index:1;pointer-events:none}.exercise-body .wireframe-body-wrap{position:absolute!important;inset:0!important;background:transparent!important;border-radius:0!important;overflow:visible!important}.exercise-body .body-aura{opacity:.4!important}.exercise-body .vocal-body-base{position:absolute!important;left:14%!important;right:auto!important;top:8dvh!important;width:112vw!important;height:82dvh!important;max-width:none!important;max-height:none!important;opacity:.52!important;object-fit:contain!important;object-position:center!important;mix-blend-mode:screen!important;filter:drop-shadow(0 0 22px rgba(236,254,255,.2))!important}.exercise-body .body-note-badge{display:none!important}.exercise-body .register-label{right:8%!important;color:rgba(255,255,255,.28)!important;font-size:13px!important}.scale-stage{position:absolute;inset:8.6dvh 0 6.8dvh 0;z-index:5}.pitch-ruler{position:absolute;left:3px;top:0;bottom:0;width:54px;display:flex;flex-direction:column;justify-content:space-between;font-size:clamp(5px,.72dvh,9px);font-weight:800;color:rgba(255,255,255,.13);line-height:1}.pitch-ruler span{position:relative;min-height:1px;text-shadow:0 0 8px rgba(0,0,0,.85)}.pitch-ruler span:after{content:'';position:absolute;left:24px;top:50%;width:18px;height:1px;background:rgba(255,255,255,.08)}.pitch-ruler span.in-range{color:rgba(255,255,255,.32)}.pitch-ruler span.in-range:after{background:rgba(255,255,255,.22)}.pitch-ruler span.octave{color:rgba(245,199,107,.78);font-size:1.08em}.pitch-ruler span.active{color:#ff3131;font-size:1.35em;text-shadow:0 0 14px rgba(255,49,49,.85)}.timeline-layer{position:absolute;left:54px;right:0;top:0;bottom:0;overflow:hidden}.hit-line{position:absolute;left:15%;top:0;bottom:0;width:1px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.34) 18%,rgba(255,255,255,.34) 66%,transparent);z-index:2}.target-note{position:absolute;height:clamp(6px,.9dvh,11px);border-radius:999px;background:rgba(255,255,255,.68);box-shadow:0 0 16px rgba(255,255,255,.22);transform:translateY(-50%);z-index:4}.voice-brush{position:absolute;left:15%;top:var(--voice-y);width:20px;height:20px;border-radius:50%;background:radial-gradient(circle,#ff6b6b 0 20%,#ff1515 42%,rgba(255,21,21,.28) 72%,transparent 100%);filter:drop-shadow(0 0 16px rgba(255,0,0,.85));transform:translate(-50%,-50%);opacity:var(--voice-visible);transition:top .045s linear,opacity .2s ease;z-index:8}.voice-brush:before{content:'';position:absolute;right:14px;top:50%;width:58px;height:4px;border-radius:999px;background:linear-gradient(90deg,rgba(255,21,21,.15),rgba(255,21,21,.94));filter:blur(.1px);transform:translateY(-50%)}.voice-brush i{position:absolute;inset:6px;border-radius:inherit;background:#ff4242}.minimal-top{position:absolute;left:64px;right:20px;top:2.2dvh;z-index:10;text-align:center;opacity:.72;pointer-events:none;transition:opacity .28s ease}.minimal-top strong{display:block;font-size:clamp(13px,1.9dvh,18px);font-weight:800;letter-spacing:.08em}.minimal-top span{display:block;margin-top:3px;font-size:11px;color:rgba(255,255,255,.52)}.progress-line{position:absolute;left:72px;right:48px;top:7.2dvh;height:3px;border-radius:999px;background:rgba(255,255,255,.16);z-index:10;overflow:hidden;transition:opacity .28s ease}.progress-line i{display:block;height:100%;border-radius:inherit;background:rgba(255,255,255,.72)}.feedback-text{position:absolute;left:80px;right:30px;top:42%;z-index:9;text-align:center;color:#74ff91;font-size:clamp(16px,2.5dvh,24px);font-weight:900;text-shadow:0 0 18px rgba(116,255,145,.38);pointer-events:none}.control-overlay{position:absolute;inset:0;z-index:20;opacity:0;pointer-events:none;transition:opacity .25s ease;background:linear-gradient(180deg,rgba(0,0,0,.3),transparent 30%,transparent 62%,rgba(0,0,0,.55))}.controls-on .control-overlay{opacity:1;pointer-events:auto}.controls-on .minimal-top,.controls-on .progress-line{opacity:1}.back-btn{position:absolute;left:18px;top:2.2dvh;width:46px;height:46px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:#fff;font-size:25px;backdrop-filter:blur(14px)}.control-row{position:absolute;left:16px;right:16px;bottom:max(18px,env(safe-area-inset-bottom));display:grid;grid-template-columns:1.1fr .9fr .9fr;gap:10px}.control-row button{border:1px solid rgba(255,255,255,.13);border-radius:18px;background:rgba(10,12,16,.72);color:#fff;font-weight:900;padding:15px 8px;backdrop-filter:blur(16px)}.control-row .main-btn{background:linear-gradient(180deg,#ffe39b,#e7b34d);color:#15100a;border:0}.countdown{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.5);backdrop-filter:blur(10px);z-index:30}.countdown b{font-size:110px;color:#f5c76b;text-shadow:0 0 50px rgba(245,199,107,.8)}@media(max-height:760px){.scale-stage{inset:8dvh 0 5.8dvh 0}.exercise-body .vocal-body-base{top:7dvh!important;height:82dvh!important}.control-row button{padding:12px 6px}.feedback-text{top:41%}}`;
