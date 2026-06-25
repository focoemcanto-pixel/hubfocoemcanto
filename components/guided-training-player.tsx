'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise } from '@/lib/training-center';
import { getTrainingDurationSeconds } from '@/lib/training-center';

const pitchOrder = ['F3','G3','A3','B3','C4','D4','E4','F4','G4','A4','B4','C5','D5','E5','F5','G5'];
const pitchFrequency: Record<string, number> = { C3:130.81,D3:146.83,E3:164.81,F3:174.61,G3:196,A3:220,B3:246.94,C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392,A4:440,B4:493.88,C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99 };

type AudioContextConstructor = typeof AudioContext;
type WindowWithWebAudio = Window & typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
type TunerStatus = 'idle' | 'listening' | 'good' | 'low' | 'high';
type TunerState = { frequency: number | null; cents: number | null; status: TunerStatus; feedback: string };
type StageStyle = CSSProperties & { '--progress': string; '--voice-y': string };

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function noteY(pitch: string) { const index = pitchOrder.indexOf(pitch); if (index === -1) return 62; return clamp(91 - (index / Math.max(1, pitchOrder.length - 1)) * 80, 8, 91); }
function frequencyY(frequency: number | null) { if (!frequency) return 70; const midi = 69 + 12 * Math.log2(frequency / 440); return clamp(91 - ((midi - 53) / 24) * 80, 8, 91); }
function formatTime(value: number) { const total = Math.max(0, Math.floor(value)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; }

function autoCorrelate(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.012) return null;
  let bestOffset = -1;
  let bestCorrelation = 0;
  const minOffset = Math.floor(sampleRate / 900);
  const maxOffset = Math.floor(sampleRate / 70);
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - offset; i += 1) correlation += buffer[i] * buffer[i + offset];
    correlation /= buffer.length - offset;
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestOffset = offset; }
  }
  if (bestOffset <= 0 || bestCorrelation < 0.0014) return null;
  return sampleRate / bestOffset;
}

export function GuidedTrainingPlayer({ exercise, compact = false }: { exercise: TrainingExercise; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const micAnimationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const synthContextRef = useRef<AudioContext | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);
  const countInTimeoutsRef = useRef<number[]>([]);
  const targetFrequencyRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [loop, setLoop] = useState(true);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const [micEnabled, setMicEnabled] = useState(false);
  const [tuner, setTuner] = useState<TunerState>({ frequency: null, cents: null, status: 'idle', feedback: 'Afinador' });

  const duration = useMemo(() => getTrainingDurationSeconds(exercise), [exercise]);
  const activeNote = exercise.notes.find((note) => currentTime >= note.start && currentTime <= note.start + note.duration);
  const targetFrequency = activeNote ? pitchFrequency[activeNote.pitch] || null : null;
  targetFrequencyRef.current = targetFrequency;
  const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));
  const voiceY = frequencyY(tuner.frequency);
  const centsDisplay = tuner.cents === null ? '—' : `${tuner.cents > 0 ? '+' : ''}${Math.round(tuner.cents)}`;
  const currentPitchLabel = activeNote?.pitch || '—';
  const style = { '--progress': String(progress), '--voice-y': `${voiceY}%` } as StageStyle;

  useEffect(() => { startMic(); return () => { stopAllAudio(); stopMic(); }; }, []);

  useEffect(() => {
    if (!isPlaying) return;
    lastFrameRef.current = null;
    function tick(timestamp: number) {
      if (lastFrameRef.current === null) lastFrameRef.current = timestamp;
      const delta = (timestamp - lastFrameRef.current) / 1000;
      lastFrameRef.current = timestamp;
      setCurrentTime((value) => {
        const next = value + delta;
        if (next >= duration) {
          if (!loop) { setIsPlaying(false); stopAllAudio(); audioRef.current?.pause(); return duration; }
          stopAllAudio();
          startAudioFrom(0);
          return 0;
        }
        return next;
      });
      animationRef.current = window.requestAnimationFrame(tick);
    }
    animationRef.current = window.requestAnimationFrame(tick);
    return () => { if (animationRef.current) window.cancelAnimationFrame(animationRef.current); };
  }, [duration, isPlaying, loop, metronomeOn]);

  function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!synthContextRef.current) {
      const browserWindow = window as WindowWithWebAudio;
      const Context = browserWindow.AudioContext || browserWindow.webkitAudioContext;
      synthContextRef.current = Context ? new Context() : null;
    }
    return synthContextRef.current;
  }

  async function startMic() {
    if (micEnabled || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const browserWindow = window as WindowWithWebAudio;
      const Context = browserWindow.AudioContext || browserWindow.webkitAudioContext;
      if (!Context) throw new Error('AudioContext unavailable');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const context = new Context();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      micContextRef.current = context;
      micStreamRef.current = stream;
      setMicEnabled(true);
      setTuner({ frequency: null, cents: null, status: 'listening', feedback: 'Cante próximo ao microfone' });
      listenToPitch(analyser, context);
    } catch {
      setTuner({ frequency: null, cents: null, status: 'idle', feedback: 'Permita o microfone' });
    }
  }

  function stopMic() {
    if (micAnimationRef.current) window.cancelAnimationFrame(micAnimationRef.current);
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micContextRef.current?.close().catch(() => undefined);
    micAnimationRef.current = null;
    micStreamRef.current = null;
    micContextRef.current = null;
    setMicEnabled(false);
  }

  function listenToPitch(analyser: AnalyserNode, audioContext: AudioContext) {
    const buffer = new Float32Array(analyser.fftSize);
    function loopPitch() {
      analyser.getFloatTimeDomainData(buffer);
      const frequency = autoCorrelate(buffer, audioContext.sampleRate);
      const target = targetFrequencyRef.current;
      if (!frequency || !target) {
        setTuner({ frequency: frequency || null, cents: null, status: 'listening', feedback: frequency ? 'Aguardando nota' : 'Cante próximo ao microfone' });
      } else {
        const cents = 1200 * Math.log2(frequency / target);
        const abs = Math.abs(cents);
        const status: TunerStatus = abs <= 28 ? 'good' : cents < 0 ? 'low' : 'high';
        setTuner({ frequency, cents, status, feedback: abs <= 28 ? 'Perfeito!' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' });
      }
      micAnimationRef.current = window.requestAnimationFrame(loopPitch);
    }
    loopPitch();
  }

  function clearCountIn() { countInTimeoutsRef.current.forEach((id) => window.clearTimeout(id)); countInTimeoutsRef.current = []; setIsCountingIn(false); setCountInBeat(null); }
  function stopAllAudio() { clearCountIn(); activeOscillatorsRef.current.forEach((oscillator) => { try { oscillator.stop(); } catch { } }); activeOscillatorsRef.current = []; }

  function playClick(context: AudioContext, startsAt: number, strong = false) {
    const osc = context.createOscillator(); const gain = context.createGain();
    osc.type = 'square'; osc.frequency.value = strong ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, startsAt); gain.gain.exponentialRampToValueAtTime(strong ? 0.22 : 0.14, startsAt + 0.006); gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.06);
    osc.connect(gain); gain.connect(context.destination); osc.start(startsAt); osc.stop(startsAt + 0.08); activeOscillatorsRef.current.push(osc);
  }

  function playPianoNote(context: AudioContext, frequency: number, startsAt: number, endsAt: number) {
    const master = context.createGain(); const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(4200, startsAt); filter.frequency.exponentialRampToValueAtTime(1600, Math.max(startsAt + 0.12, endsAt - 0.02)); filter.connect(master); master.connect(context.destination);
    master.gain.setValueAtTime(0.0001, startsAt); master.gain.exponentialRampToValueAtTime(0.32, startsAt + 0.008); master.gain.exponentialRampToValueAtTime(0.12, startsAt + 0.22); master.gain.exponentialRampToValueAtTime(0.0001, endsAt);
    [{ ratio: 1, gain: .75, type: 'triangle' as OscillatorType }, { ratio: 2, gain: .2, type: 'sine' as OscillatorType }, { ratio: 3, gain: .08, type: 'sine' as OscillatorType }].forEach((p) => {
      const osc = context.createOscillator(); const gain = context.createGain(); osc.type = p.type; osc.frequency.value = frequency * p.ratio; gain.gain.value = p.gain; osc.connect(gain); gain.connect(filter); osc.start(startsAt); osc.stop(endsAt + .04); activeOscillatorsRef.current.push(osc);
    });
  }

  function startAudioFrom(startAt: number) {
    const context = getAudioContext(); if (!context) return;
    context.resume().catch(() => undefined);
    const now = context.currentTime + 0.025;
    if (metronomeOn) {
      const beatUnit = 60 / Math.max(1, exercise.bpm);
      const firstBeat = Math.max(0, Math.ceil(startAt / beatUnit));
      for (let beat = firstBeat; beat * beatUnit <= duration; beat += 1) {
        const beatTime = beat * beatUnit;
        playClick(context, now + Math.max(0, beatTime - startAt), beat % 4 === 0);
      }
    }
    exercise.notes.forEach((note) => {
      const frequency = pitchFrequency[note.pitch]; if (!frequency) return;
      const noteEnd = note.start + note.duration;
      if (noteEnd <= startAt) return;
      playPianoNote(context, frequency, now + Math.max(0, note.start - startAt), now + Math.max(0.18, noteEnd - startAt));
    });
  }

  function startCountInThenPlay(startAt: number) {
    const context = getAudioContext(); if (!context) { setCurrentTime(startAt); setIsPlaying(true); return; }
    stopAllAudio(); context.resume().catch(() => undefined); startMic(); setIsCountingIn(true);
    const beatMs = (60 / Math.max(1, exercise.bpm)) * 1000;
    [4, 3, 2, 1].forEach((value, index) => {
      const timeout = window.setTimeout(() => { setCountInBeat(value); playClick(context, context.currentTime + .01, value === 4); }, index * beatMs);
      countInTimeoutsRef.current.push(timeout);
    });
    const startTimeout = window.setTimeout(() => { clearCountIn(); setCurrentTime(startAt); startAudioFrom(startAt); setIsPlaying(true); }, 4 * beatMs);
    countInTimeoutsRef.current.push(startTimeout);
  }

  function togglePlayback() { if (isPlaying || isCountingIn) { stopAllAudio(); audioRef.current?.pause(); setIsPlaying(false); return; } startCountInThenPlay(currentTime >= duration ? 0 : currentTime); }
  function restart() { stopAllAudio(); audioRef.current?.pause(); setIsPlaying(false); setCurrentTime(0); }

  return (
    <section className={`premium-workout ${compact ? 'compact' : ''} tuner-${tuner.status}`} style={style}>
      <style>{css}</style>
      {exercise.audioUrl ? <audio ref={audioRef} src={exercise.audioUrl} loop={loop} /> : null}
      {isCountingIn ? <div className="count-in-overlay"><span>{countInBeat}</span><small>prepare a entrada</small></div> : null}

      <header className="player-head">
        <button type="button" onClick={restart} className="back-btn">‹</button>
        <div><span>Exercício 1</span><strong>{exercise.title}</strong></div>
        <button type="button" className="piano-pill">Piano</button>
      </header>
      <div className="time-row"><span>{formatTime(currentTime)}</span><div className="timeline"><i style={{ width: `${progress}%` }} /></div><span>{formatTime(duration)}</span><b>♩ {exercise.bpm} BPM</b></div>

      <main className="workout-stage">
        <div className="pitch-ruler">{pitchOrder.slice().reverse().map((pitch) => <span className={pitch === currentPitchLabel ? 'active' : pitch === 'G3' || pitch === 'C4' ? 'key' : ''} key={pitch}>{pitch}</span>)}<div className="ruler-well"><i /></div><div className="ruler-glow" /></div>
        <img className="silhouette-img" src="/images/vocal-silhouette.svg" alt="" aria-hidden="true" />
        <div className="moving-field"><div className="moving-canvas">{exercise.notes.map((note, index) => <span className="note-node" key={`${note.pitch}-${index}`} style={{ left: `${16 + index * 13}%`, top: `${noteY(note.pitch)}%` }} />)}<svg className="trace-svg" viewBox="0 0 980 420" preserveAspectRatio="none"><path className="voice-trace" d="M16 292 C78 292 112 292 146 292 S178 246 218 246 S254 224 292 224 S328 168 372 168 S420 142 468 142 S520 88 568 88 S640 88 684 88 S734 44 790 44" /></svg></div></div>
        <div className="voice-dot"><span /></div>
        <div className="feedback-card"><strong>{tuner.feedback}</strong><b>{centsDisplay}</b><span>centavos</span></div>
      </main>

      <section className="training-bottom">
        <div className="bottom-grid"><div className="vocal-card"><strong>NG...NG...NG...</strong><span>Vocal Fry</span><i /></div><div className="mic-card"><div className="mic-circle">🎙</div><span>{micEnabled ? 'Afinador ativo' : 'Permitir microfone'}</span></div><div className="bpm-card"><strong>{exercise.bpm}</strong><span>BPM</span><i><em /></i></div></div>
        <div className="keyboard"><span/><span/><span/><span className="on"/><span/><span className="on"/><span/><span/><span/><span/><span/></div>
        <div className="controls"><button className="primary" type="button" onClick={togglePlayback}>{isPlaying ? 'Pausar' : isCountingIn ? 'Cancelar' : 'Iniciar'}</button><button type="button" onClick={() => setLoop((value) => !value)}>{loop ? 'Loop' : 'Sem loop'}</button><button type="button" onClick={() => setMetronomeOn((value) => !value)}>{metronomeOn ? 'Metrônomo' : 'Sem metrônomo'}</button></div>
      </section>
    </section>
  );
}

const css = `.premium-workout{height:100%;min-height:0;max-height:100%;position:relative;overflow:hidden;color:#fff;background:radial-gradient(circle at 50% 35%,rgba(255,215,73,.12),transparent 30%),linear-gradient(180deg,#071018,#020305);display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:7px;padding:10px 12px 0}.premium-workout:before{content:'';position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px);background-size:64px 100%,100% 40px;opacity:.72;pointer-events:none}.premium-workout>*{position:relative;z-index:1}.player-head{display:grid;grid-template-columns:52px 1fr 84px;align-items:center;gap:8px}.player-head div{text-align:center;min-width:0}.player-head span{display:block;color:#d8d8dd;font-weight:900;font-size:clamp(11px,1.35dvh,14px)}.player-head strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:clamp(21px,3.1dvh,31px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f1f1f1}.back-btn,.piano-pill{height:clamp(42px,5.8dvh,56px);border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;border-radius:16px;font-size:30px}.piano-pill{font-size:14px;font-weight:950}.time-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:9px;align-items:center;font-size:clamp(13px,1.85dvh,18px);color:#f0f0f0}.time-row b{white-space:nowrap;font-weight:950}.timeline{height:5px;border-radius:999px;background:rgba(255,255,255,.18);overflow:hidden}.timeline i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ffd84f,#fff);box-shadow:0 0 18px #ffd84f}.workout-stage{min-height:0;position:relative;overflow:hidden;border-radius:0;padding-bottom:clamp(192px,27dvh,260px)}.pitch-ruler{position:absolute;left:0;top:0;bottom:clamp(190px,27dvh,255px);width:44px;display:flex;flex-direction:column;justify-content:space-between;color:rgba(255,255,255,.34);font-size:clamp(10px,1.45dvh,15px);z-index:8}.pitch-ruler span{position:relative;line-height:1}.pitch-ruler span:after{content:'';position:absolute;left:26px;top:50%;width:16px;height:1px;background:rgba(255,255,255,.14)}.pitch-ruler .active{color:#ff3434;font-weight:950;text-shadow:0 0 12px rgba(255,40,40,.65)}.pitch-ruler .key{color:#ffd94d;font-weight:950}.ruler-well{position:absolute;left:48px;top:8%;bottom:8%;width:15px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(0,0,0,.32);overflow:hidden}.ruler-well i{position:absolute;left:2px;right:2px;bottom:0;height:calc(100% - var(--voice-y));border-radius:999px;background:linear-gradient(0deg,#ffd94d,rgba(255,217,77,.08));box-shadow:0 0 26px rgba(255,217,77,.75)}.ruler-glow{position:absolute;left:37px;top:var(--voice-y);width:32px;height:32px;border-radius:50%;background:radial-gradient(circle,#fff 0 18%,#ffd94d 32%,rgba(255,217,77,.08) 72%);box-shadow:0 0 32px #ffd94d;transform:translateY(-50%)}.silhouette-img{position:absolute;left:clamp(72px,20vw,112px);top:clamp(12px,2.5dvh,32px);height:clamp(245px,49dvh,430px);opacity:.58;filter:drop-shadow(0 0 24px rgba(255,255,255,.16));animation:silGlow 2.4s ease-in-out infinite;z-index:1}.moving-field{position:absolute;left:clamp(92px,23vw,128px);right:-45vw;top:clamp(28px,5dvh,58px);bottom:clamp(196px,28dvh,265px);overflow:hidden;z-index:4}.moving-canvas{position:absolute;left:0;top:0;width:980px;height:100%;transform:translateX(calc(var(--progress) * -4.7px));transition:transform .035s linear}.trace-svg{position:absolute;inset:0;width:980px;height:100%;z-index:1}.voice-trace{fill:none;stroke:#ffd44a;stroke-width:6;stroke-linecap:round;filter:drop-shadow(0 0 18px #ffd44a);stroke-dasharray:620;stroke-dashoffset:calc(620 - (var(--progress) * 6.2))}.note-node{position:absolute;width:clamp(42px,6.2dvh,70px);height:clamp(10px,1.7dvh,18px);border-radius:999px;background:rgba(255,255,255,.72);box-shadow:0 0 18px rgba(255,255,255,.28);transform:translate(-50%,-50%);z-index:2}.voice-dot{position:absolute;left:clamp(92px,23vw,128px);top:var(--voice-y);width:clamp(24px,3.8dvh,34px);height:clamp(24px,3.8dvh,34px);border-radius:50%;background:#ffd44a;box-shadow:0 0 34px #ffd44a;transform:translateY(-50%);transition:top .025s linear;z-index:9}.voice-dot span{position:absolute;inset:28%;border-radius:50%;background:#fff}.feedback-card{position:absolute;right:6px;bottom:clamp(204px,29dvh,270px);width:clamp(160px,40vw,300px);border:1px solid rgba(255,255,255,.14);background:rgba(5,8,11,.88);backdrop-filter:blur(16px);border-radius:22px;padding:clamp(8px,1.4dvh,14px);text-align:center;box-shadow:0 28px 80px rgba(0,0,0,.32);z-index:10}.feedback-card strong{display:block;color:#6fff8d;font-size:clamp(14px,1.9dvh,22px)}.feedback-card b{display:block;font-size:clamp(26px,4.6dvh,50px);line-height:1;margin-top:3px}.feedback-card span{display:block;color:#d4d4d4;font-size:clamp(10px,1.35dvh,14px)}.training-bottom{position:absolute;left:12px;right:12px;bottom:8px;display:grid;gap:8px;z-index:20}.bottom-grid{display:grid;grid-template-columns:1.1fr .82fr .82fr;gap:8px}.bottom-grid>div,.keyboard{border:1px solid rgba(255,255,255,.12);background:rgba(8,10,14,.88);border-radius:17px;padding:clamp(8px,1.25dvh,13px);box-shadow:0 18px 50px rgba(0,0,0,.24);backdrop-filter:blur(10px)}.vocal-card strong{display:block;color:#ffd94d;font-size:clamp(13px,1.8dvh,18px)}.vocal-card span{color:#ddd;font-size:clamp(11px,1.55dvh,14px)}.vocal-card i{display:block;height:clamp(10px,1.7dvh,18px);margin-top:7px;background:repeating-linear-gradient(90deg,#ffd94d 0 2px,transparent 2px 8px);opacity:.8}.mic-card{text-align:center}.mic-circle{width:clamp(44px,6.4dvh,68px);height:clamp(44px,6.4dvh,68px);border-radius:50%;display:grid;place-items:center;border:2px solid #ffd94d;margin:0 auto 4px;box-shadow:0 0 26px rgba(255,217,77,.45);font-size:clamp(22px,3.1dvh,31px)}.mic-card span{color:#6fff8d;font-weight:950;font-size:clamp(10px,1.35dvh,13px)}.bpm-card{text-align:center}.bpm-card strong{font-size:clamp(26px,4.2dvh,38px)}.bpm-card span{display:block;color:#ddd;font-size:clamp(10px,1.4dvh,13px)}.bpm-card i{display:flex;justify-content:center;gap:6px;margin-top:6px}.bpm-card i:before,.bpm-card i:after,.bpm-card i em{content:'';width:8px;height:8px;border-radius:50%;background:#ffd94d;display:block}.keyboard{display:flex;gap:3px;height:clamp(44px,7.2dvh,72px);padding:8px 10px}.keyboard span{flex:1;border-radius:4px;background:linear-gradient(180deg,#fff 0,#d9d9d9 46%,#6e6e6e 100%);position:relative;box-shadow:inset 0 -8px 14px rgba(0,0,0,.35)}.keyboard span:after{content:'';position:absolute;top:0;right:-7px;width:12px;height:58%;background:linear-gradient(180deg,#121212,#030303);border-radius:0 0 5px 5px;z-index:2;box-shadow:0 4px 8px rgba(0,0,0,.6)}.keyboard span:nth-last-child(1):after,.keyboard span:nth-child(3):after,.keyboard span:nth-child(7):after{display:none}.keyboard span.on{background:linear-gradient(180deg,#fff1aa,#ffd038);box-shadow:0 0 20px rgba(255,217,77,.75),inset 0 -8px 14px rgba(0,0,0,.2)}.controls{display:flex;gap:7px}.controls button{flex:1;border:1px solid rgba(255,255,255,.14);background:rgba(10,12,16,.9);color:#fff;border-radius:13px;padding:clamp(8px,1.4dvh,12px) 6px;font-weight:950;font-size:clamp(10px,1.35dvh,13px)}.controls .primary{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07;border:0}.count-in-overlay{position:absolute;inset:0;z-index:50;display:grid;place-items:center;background:rgba(0,0,0,.52);backdrop-filter:blur(12px);text-align:center}.count-in-overlay span{display:block;font-size:112px;font-weight:950;color:#ffd94d;text-shadow:0 0 44px #ffd94d}.count-in-overlay small{display:block;text-transform:uppercase;letter-spacing:.14em;font-weight:950;color:#fff;margin-top:-30px}@keyframes silGlow{0%,100%{opacity:.46;filter:drop-shadow(0 0 13px rgba(255,255,255,.08))}50%{opacity:.66;filter:drop-shadow(0 0 26px rgba(255,255,255,.18))}}@media(max-height:760px){.premium-workout{gap:5px;padding-top:7px}.player-head{grid-template-columns:48px 1fr 76px}.back-btn,.piano-pill{height:40px}.time-row{font-size:12px}.workout-stage{padding-bottom:178px}.pitch-ruler{bottom:178px}.moving-field{bottom:184px}.feedback-card{bottom:188px}.training-bottom{gap:6px}.keyboard{height:42px}.bottom-grid>div{padding:7px}.silhouette-img{height:43dvh}.controls button{padding:7px 5px}}@media(max-width:390px){.time-row{grid-template-columns:auto 1fr auto}.time-row b{display:none}.player-head strong{max-width:48vw}.feedback-card{width:158px}.moving-field{left:96px}.voice-dot{left:96px}.silhouette-img{left:72px}.bottom-grid{gap:6px}}`;
