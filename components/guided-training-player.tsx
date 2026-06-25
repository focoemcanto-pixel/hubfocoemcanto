'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise, TrainingNote } from '@/lib/training-center';
import { WireframeBody } from '@/components/vocal/wireframe-body';
import { autoCorrelate, getVocalRegister, midiToBrazilianNoteName, midiToFrequency, noteNameToMidi } from '@/lib/audio/pitch';

const MIN_MIDI = 12;
const MAX_MIDI = 84;
const HIT_X = 15;
const PX_PER_BEAT = 10;
const PREVIEW_BEATS = 10;
const DEFAULT_LOW = noteNameToMidi('E3') ?? 52;
const DEFAULT_HIGH = noteNameToMidi('G5') ?? 79;
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

export function GuidedTrainingPlayer({ exercise }: { exercise: TrainingExercise; compact?: boolean }) {
  const [currentBeat, setCurrentBeat] = useState(0);
  const [bpm, setBpm] = useState(exercise.bpm);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const [metro, setMetro] = useState(true);
  const [controls, setControls] = useState(true);
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

  const beatNotes = useMemo(() => buildBeatNotes(exercise), [exercise]);
  const totalBeats = useMemo(() => Math.max(...beatNotes.map((note) => note.endBeat), 0), [beatNotes]);
  const beatSeconds = 60 / bpm;
  const currentSeconds = currentBeat * beatSeconds;
  const durationSeconds = totalBeats * beatSeconds;
  const activeNote = beatNotes.find((note) => currentBeat >= note.startBeat && currentBeat <= note.endBeat);
  const activeMidi = activeNote?.midi ?? null;
  const progress = totalBeats ? Math.min(100, (currentBeat / totalBeats) * 100) : 0;
  const voiceY = yFromMidi(tuner.midi);
  const cssVars = { '--voice-y': `${voiceY}%`, '--voice-visible': tuner.midi == null ? '0' : '1', '--progress': String(progress) } as Vars;

  targetMidiRef.current = activeMidi;
  currentBeatRef.current = currentBeat;

  useEffect(() => () => { stopAudio(); stopMic(); }, []);

  useEffect(() => {
    if (!playing) return;
    lastFrameRef.current = null;
    const tick = (now: number) => {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const deltaSeconds = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      setCurrentBeat((old) => {
        const next = old + deltaSeconds * (bpm / 60);
        if (next >= totalBeats) {
          setVoiceTrail([]);
          stopAudio();
          if (!loop) { setPlaying(false); return totalBeats; }
          scheduleAudio(0);
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, totalBeats, bpm, loop, metro]);

  useEffect(() => { if (playing) { stopAudio(); scheduleAudio(currentBeatRef.current); } }, [bpm, metro]);
  useEffect(() => { if (!playing || !controls) return; const id = window.setTimeout(() => setControls(false), 2600); return () => window.clearTimeout(id); }, [playing, controls]);

  function showControls() { setControls(true); }
  function getAudioContext() { if (typeof window === 'undefined') return null; if (!audioCtxRef.current) { const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext; audioCtxRef.current = Ctor ? new Ctor() : null; } return audioCtxRef.current; }
  function stopAudio() { timersRef.current.forEach(clearTimeout); timersRef.current = []; oscillatorsRef.current.forEach((osc) => { try { osc.stop(); } catch {} }); oscillatorsRef.current = []; setCount(null); }

  function playClick(context: AudioContext, at: number, strong = false) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = strong ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.12 : 0.075, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.07);
    oscillatorsRef.current.push(oscillator);
  }

  function playHammer(context: AudioContext, destination: AudioNode, at: number) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.035), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 2800;
    filter.Q.value = 1.8;
    gain.gain.setValueAtTime(0.18, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(at);
  }

  function playPiano(context: AudioContext, midi: number, at: number, end: number) {
    const frequency = midiToFrequency(midi);
    const compressor = context.createDynamicsCompressor();
    const master = context.createGain();
    const body = context.createBiquadFilter();
    const presence = context.createBiquadFilter();

    compressor.threshold.value = -10;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.14;

    body.type = 'lowshelf';
    body.frequency.value = 190;
    body.gain.value = 4.5;
    presence.type = 'peaking';
    presence.frequency.value = 3200;
    presence.Q.value = 0.9;
    presence.gain.value = 5.5;

    body.connect(presence);
    presence.connect(master);
    master.connect(compressor);
    compressor.connect(context.destination);

    master.gain.setValueAtTime(0.0001, at);
    master.gain.exponentialRampToValueAtTime(1.55, at + 0.009);
    master.gain.exponentialRampToValueAtTime(0.72, at + 0.13);
    master.gain.exponentialRampToValueAtTime(0.18, Math.max(at + 0.35, end - 0.08));
    master.gain.exponentialRampToValueAtTime(0.0001, Math.max(at + 0.42, end + 0.08));

    playHammer(context, presence, at);

    [
      { ratio: 1, gain: 1.0, type: 'triangle' as OscillatorType, detune: 0 },
      { ratio: 2.003, gain: 0.38, type: 'sine' as OscillatorType, detune: -4 },
      { ratio: 3.006, gain: 0.2, type: 'sine' as OscillatorType, detune: 5 },
      { ratio: 4.012, gain: 0.11, type: 'sine' as OscillatorType, detune: 2 },
      { ratio: 5.02, gain: 0.055, type: 'sine' as OscillatorType, detune: -6 },
    ].forEach((partial) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = partial.type;
      oscillator.frequency.value = frequency * partial.ratio;
      oscillator.detune.value = partial.detune;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(partial.gain, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(partial.gain * 0.26, at + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(at + 0.38, end + 0.06));
      oscillator.connect(gain);
      gain.connect(body);
      oscillator.start(at);
      oscillator.stop(Math.max(at + 0.45, end + 0.12));
      oscillatorsRef.current.push(oscillator);
    });
  }

  function scheduleAudio(fromBeat: number) {
    const context = getAudioContext();
    if (!context) return;
    context.resume().catch(() => null);
    const now = context.currentTime + 0.03;
    const secondsPerBeat = 60 / bpm;
    if (metro) for (let beatIndex = Math.ceil(fromBeat); beatIndex <= totalBeats; beatIndex += 1) playClick(context, now + Math.max(0, beatIndex - fromBeat) * secondsPerBeat, beatIndex % 4 === 0);
    beatNotes.forEach((note) => {
      if (note.midi == null || note.endBeat <= fromBeat) return;
      const startDelay = Math.max(0, note.startBeat - fromBeat) * secondsPerBeat;
      const endDelay = Math.max(0.18, (note.endBeat - fromBeat) * secondsPerBeat);
      playPiano(context, note.midi, now + startDelay, now + endDelay);
    });
  }

  async function startPlayback() {
    if (playing || count) { stopAudio(); setPlaying(false); setControls(true); setVoiceTrail([]); return; }
    await startMic();
    const context = getAudioContext();
    if (!context) { setPlaying(true); return; }
    context.resume().catch(() => null);
    stopAudio();
    setVoiceTrail([]);
    const beatMs = (60 / bpm) * 1000;
    [4, 3, 2, 1].forEach((value, index) => timersRef.current.push(window.setTimeout(() => { setCount(value); playClick(context, context.currentTime + 0.01, value === 4); }, index * beatMs)));
    timersRef.current.push(window.setTimeout(() => { setCount(null); const start = currentBeat >= totalBeats ? 0 : currentBeat; setCurrentBeat(start); scheduleAudio(start); setPlaying(true); }, 4 * beatMs));
  }

  function adjustBpm(delta: number) { setBpm((old) => clamp(old + delta, 48, 140)); setControls(true); }

  async function startMic() {
    if (micReady || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const context = new Ctor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
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
      const target = targetMidiRef.current;
      if (!frequency) {
        silenceRef.current += 1;
        if (silenceRef.current > 3) { setVoiceTrail([]); setTuner((old) => ({ ...old, midi: null, cents: null, feedback: 'Cante próximo ao microfone' })); }
      } else {
        silenceRef.current = 0;
        const liveMidi = floatMidiFromFrequency(frequency);
        const cents = target == null ? null : (liveMidi - target) * 100;
        const y = yFromMidi(liveMidi);
        trailTickRef.current += 1;
        setVoiceTrail((old) => [...old.slice(-4), { id: Date.now(), y, wobble: (trailTickRef.current % 7) - 3 }]);
        setTuner({ midi: liveMidi, cents, feedback: cents == null ? 'Aguardando nota' : Math.abs(cents) <= 28 ? 'Perfeito' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' });
      }
      micRafRef.current = requestAnimationFrame(loopPitch);
    };
    loopPitch();
  }

  function targetStyle(note: BeatNote): CSSProperties | null { if (note.midi == null) return null; const left = HIT_X + (note.startBeat - currentBeat) * PX_PER_BEAT; const width = Math.max(5.5, note.durationBeats * PX_PER_BEAT); if (left + width < -6 || left > HIT_X + PREVIEW_BEATS * PX_PER_BEAT) return null; return { left: `${left}%`, width: `${width}%`, top: `${yFromMidi(note.midi)}%` }; }

  return (
    <section className={`exercise-experience ${controls ? 'controls-on' : ''}`} style={cssVars} onPointerDown={showControls}>
      <style>{css}</style>
      <div className="exercise-bg" />
      <div className="exercise-body" aria-hidden="true"><WireframeBody activeRegion={getVocalRegister(activeMidi)} currentMidi={activeMidi} currentLabel={activeMidi != null ? midiToBrazilianNoteName(activeMidi) : undefined} /></div>
      <div className="scale-stage">
        <div className="pitch-ruler">{SCALE.map((midi) => { const inRange = midi >= DEFAULT_LOW && midi <= DEFAULT_HIGH; const isOctave = midi % 12 === 0; const isActive = activeMidi != null && Math.round(activeMidi) === midi; return <span className={`${inRange ? 'in-range' : ''} ${isOctave ? 'octave' : ''} ${isActive ? 'active' : ''}`} key={midi}>{midiToBrazilianNoteName(midi)}</span>; })}</div>
        <div className="timeline-layer"><div className="hit-line" />{beatNotes.map((note, index) => { const style = targetStyle(note); return style ? <span className="target-note" key={`${note.pitch}-${index}`} style={style} /> : null; })}<div className="voice-trail" aria-hidden="true">{voiceTrail.map((point, index) => { const age = voiceTrail.length - index; return <span key={point.id} style={{ left: `${HIT_X - age * 1.45}%`, top: `${point.y}%`, width: `${Math.max(1.2, 3.6 - age * 0.48)}%`, opacity: Math.max(0.01, 0.6 - age * 0.18), transform: `translateY(-50%) rotate(${point.wobble * 0.65}deg)` }} />; })}</div><div className="voice-brush"><i /></div></div>
      </div>
      <div className="minimal-top"><strong>{exercise.title}</strong><span>{formatTime(currentSeconds)} / {formatTime(durationSeconds)}</span></div>
      <div className="progress-line"><i style={{ width: `${progress}%` }} /></div>
      <div className="feedback-text">{tuner.feedback}</div>
      {count ? <div className="countdown"><b>{count}</b></div> : null}
      <div className="control-overlay" onPointerDown={(event) => event.stopPropagation()}><button className="back-btn" type="button" onClick={() => history.back()}>←</button><div className="bpm-control" aria-label="Controle de BPM"><button type="button" onClick={() => adjustBpm(-2)}>−</button><span><b>{bpm}</b><small>BPM</small></span><button type="button" onClick={() => adjustBpm(2)}>+</button></div><div className="control-row"><button type="button" onClick={() => { setCurrentBeat(0); stopAudio(); setVoiceTrail([]); if (playing) scheduleAudio(0); }}>↺<span>Reiniciar</span></button><button className="main-btn" type="button" onClick={startPlayback}>{playing ? 'Ⅱ' : count ? '×' : '▶'}<span>{playing ? 'Pausar' : count ? 'Cancelar' : 'Iniciar'}</span></button><button type="button" onClick={() => setLoop((value) => !value)}>∞<span>{loop ? 'Loop' : 'Único'}</span></button></div></div>
    </section>
  );
}

const css = `.exercise-experience{position:relative;height:100%;min-height:100dvh;overflow:hidden;color:#f8fafc;background:#050607;touch-action:manipulation;isolation:isolate}.exercise-bg{position:absolute;inset:0;background:radial-gradient(circle at 64% 40%,rgba(112,232,255,.11),transparent 28%),radial-gradient(circle at 54% 58%,rgba(245,199,107,.1),transparent 28%),linear-gradient(180deg,#121419 0%,#050608 62%,#020304 100%)}.exercise-bg:after{content:'';position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px);background-size:12.5vw 100%,100% 7.2vh;mask-image:linear-gradient(90deg,rgba(0,0,0,.55),#000 28%,#000 82%,rgba(0,0,0,.25))}.exercise-body{position:absolute;inset:0;z-index:1;pointer-events:none}.exercise-body .wireframe-body-wrap{position:absolute!important;inset:0!important;background:transparent!important;border-radius:0!important;overflow:visible!important}.exercise-body .body-aura{opacity:.4!important}.exercise-body .vocal-body-base{position:absolute!important;left:14%!important;right:auto!important;top:8dvh!important;width:112vw!important;height:82dvh!important;max-width:none!important;max-height:none!important;opacity:.52!important;object-fit:contain!important;object-position:center!important;mix-blend-mode:screen!important;filter:drop-shadow(0 0 22px rgba(236,254,255,.2))!important}.exercise-body .body-note-badge{display:none!important}.exercise-body .register-label{right:8%!important;color:rgba(255,255,255,.28)!important;font-size:13px!important}.scale-stage{position:absolute;inset:8.6dvh 0 6.8dvh 0;z-index:5}.pitch-ruler{position:absolute;left:3px;top:0;bottom:0;width:54px;display:flex;flex-direction:column;justify-content:space-between;font-size:clamp(5px,.72dvh,9px);font-weight:800;color:rgba(255,255,255,.13);line-height:1}.pitch-ruler span{position:relative;min-height:1px;text-shadow:0 0 8px rgba(0,0,0,.85)}.pitch-ruler span:after{content:'';position:absolute;left:24px;top:50%;width:18px;height:1px;background:rgba(255,255,255,.08)}.pitch-ruler span.in-range{color:rgba(255,255,255,.32)}.pitch-ruler span.in-range:after{background:rgba(255,255,255,.22)}.pitch-ruler span.octave{color:rgba(245,199,107,.78);font-size:1.08em}.pitch-ruler span.active{color:#ff3131;font-size:1.35em;text-shadow:0 0 14px rgba(255,49,49,.85)}.timeline-layer{position:absolute;left:54px;right:0;top:0;bottom:0;overflow:hidden}.hit-line{position:absolute;left:15%;top:0;bottom:0;width:1px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.34) 18%,rgba(255,255,255,.34) 66%,transparent);z-index:2}.target-note{position:absolute;height:clamp(6px,.9dvh,11px);border-radius:999px;background:rgba(255,255,255,.68);box-shadow:0 0 16px rgba(255,255,255,.22);transform:translateY(-50%);z-index:4}.voice-trail{position:absolute;inset:0;z-index:7;pointer-events:none;opacity:var(--voice-visible)}.voice-trail span{position:absolute;height:clamp(2px,.34dvh,3px);border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,45,45,.72),rgba(255,255,255,.5));box-shadow:0 0 8px rgba(255,30,30,.36);filter:blur(.08px);transform-origin:right center;animation:voiceTrailFade .14s linear both}.voice-brush{position:absolute;left:15%;top:var(--voice-y);width:15px;height:15px;border-radius:50%;background:radial-gradient(circle,#ffd7d7 0 18%,#ff2d2d 45%,rgba(255,21,21,.34) 75%,transparent 100%);filter:drop-shadow(0 0 14px rgba(255,0,0,.9));transform:translate(-50%,-50%);opacity:var(--voice-visible);transition:opacity .12s ease;z-index:8}.voice-brush i{position:absolute;inset:5px;border-radius:inherit;background:#fff}.minimal-top{position:absolute;left:64px;right:20px;top:2.2dvh;z-index:10;text-align:center;opacity:.72;pointer-events:none;transition:opacity .28s ease}.minimal-top strong{display:block;font-size:clamp(13px,1.9dvh,18px);font-weight:800;letter-spacing:.08em}.minimal-top span{display:block;margin-top:3px;font-size:11px;color:rgba(255,255,255,.52)}.progress-line{position:absolute;left:72px;right:48px;top:7.2dvh;height:3px;border-radius:999px;background:rgba(255,255,255,.16);z-index:10;overflow:hidden;transition:opacity .28s ease}.progress-line i{display:block;height:100%;border-radius:inherit;background:rgba(255,255,255,.72)}.feedback-text{position:absolute;left:80px;right:30px;top:42%;z-index:9;text-align:center;color:#74ff91;font-size:clamp(16px,2.5dvh,24px);font-weight:900;text-shadow:0 0 18px rgba(116,255,145,.38);pointer-events:none}.control-overlay{position:absolute;inset:0;z-index:20;opacity:0;pointer-events:none;transition:opacity .25s ease;background:linear-gradient(180deg,rgba(0,0,0,.18),transparent 35%,transparent 52%,rgba(0,0,0,.5))}.controls-on .control-overlay{opacity:1;pointer-events:auto}.controls-on .minimal-top,.controls-on .progress-line{opacity:1}.back-btn{position:absolute;left:18px;top:2.2dvh;width:44px;height:44px;border:1px solid rgba(255,255,255,.08);border-radius:50%;background:rgba(255,255,255,.06);color:#fff;font-size:24px;backdrop-filter:blur(14px)}.bpm-control{position:absolute;left:50%;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 118px);transform:translateX(-50%);display:flex;align-items:center;gap:18px;color:#fff}.bpm-control button{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#fff;font-size:24px;backdrop-filter:blur(14px)}.bpm-control span{display:grid;place-items:center;min-width:78px}.bpm-control b{font-size:28px;line-height:1}.bpm-control small{font-size:10px;letter-spacing:.18em;color:rgba(255,255,255,.58)}.control-row{position:absolute;left:24px;right:24px;bottom:max(18px,env(safe-area-inset-bottom));display:grid;grid-template-columns:1fr 1.2fr 1fr;align-items:end;gap:18px}.control-row button{border:0;background:transparent;color:#fff;font-weight:700;padding:0;display:grid;place-items:center;gap:8px;font-size:38px;text-shadow:0 0 22px rgba(255,255,255,.2)}.control-row button span{font-size:13px;font-weight:500;color:rgba(255,255,255,.76);text-shadow:none}.control-row .main-btn{width:86px;height:86px;justify-self:center;border:2px solid rgba(255,255,255,.86);border-radius:50%;font-size:42px;background:rgba(255,255,255,.025);backdrop-filter:blur(12px)}.control-row .main-btn span{position:absolute;top:94px}.countdown{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.5);backdrop-filter:blur(10px);z-index:30}.countdown b{font-size:110px;color:#f5c76b;text-shadow:0 0 50px rgba(245,199,107,.8)}@keyframes voiceTrailFade{0%{opacity:.68}100%{opacity:0}}@media(max-height:760px){.scale-stage{inset:8dvh 0 5.8dvh 0}.exercise-body .vocal-body-base{top:7dvh!important;height:82dvh!important}.feedback-text{top:41%}.bpm-control{bottom:calc(max(12px,env(safe-area-inset-bottom)) + 102px)}.control-row .main-btn{width:76px;height:76px}.control-row .main-btn span{top:84px}}`;
