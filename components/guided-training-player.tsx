'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrainingExercise } from '@/lib/training-center';
import { getTrainingDurationSeconds } from '@/lib/training-center';

const pitchOrder = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const pitchFrequency: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25,
};

type AudioContextConstructor = typeof AudioContext;
type WindowWithWebAudio = Window & typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
type TunerStatus = 'idle' | 'listening' | 'good' | 'low' | 'high';

type TunerState = { frequency: number | null; cents: number | null; status: TunerStatus; feedback: string };

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function pitchToY(pitch: string) { const index = pitchOrder.indexOf(pitch); if (index === -1) return 50; return clamp(86 - (index / Math.max(1, pitchOrder.length - 1)) * 72, 10, 88); }
function frequencyToY(frequency: number | null) { if (!frequency) return 50; const midi = 69 + 12 * Math.log2(frequency / 440); return clamp(86 - ((midi - 48) / 24) * 72, 8, 90); }
function formatTime(value: number) { const total = Math.max(0, Math.floor(value)); const minutes = Math.floor(total / 60); const seconds = String(total % 60).padStart(2, '0'); return `${minutes}:${seconds}`; }

function autoCorrelate(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.018) return null;
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
  if (bestOffset <= 0 || bestCorrelation < 0.002) return null;
  return sampleRate / bestOffset;
}

export function GuidedTrainingPlayer({ exercise, compact = false }: { exercise: TrainingExercise; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const micAnimationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const synthContextRef = useRef<AudioContext | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);
  const countInTimeoutsRef = useRef<number[]>([]);
  const targetFrequencyRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const [micEnabled, setMicEnabled] = useState(false);
  const [tuner, setTuner] = useState<TunerState>({ frequency: null, cents: null, status: 'idle', feedback: 'Ative o afinador' });

  const duration = useMemo(() => getTrainingDurationSeconds(exercise), [exercise]);
  const activeNote = exercise.notes.find((note) => currentTime >= note.start && currentTime <= note.start + note.duration);
  const targetFrequency = activeNote ? pitchFrequency[activeNote.pitch] || null : null;
  targetFrequencyRef.current = targetFrequency;
  const hasAudioFile = Boolean(exercise.audioUrl);
  const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));
  const voiceY = frequencyToY(tuner.frequency);
  const targetY = activeNote ? pitchToY(activeNote.pitch) : 50;
  const centsDisplay = tuner.cents === null ? '—' : `${tuner.cents > 0 ? '+' : ''}${Math.round(tuner.cents)}¢`;

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);
  useEffect(() => () => { stopAllAudio(); stopMic(); }, []);

  useEffect(() => {
    if (!isPlaying) return;
    lastFrameRef.current = null;
    function tick(timestamp: number) {
      if (lastFrameRef.current === null) lastFrameRef.current = timestamp;
      const delta = ((timestamp - lastFrameRef.current) / 1000) * speed;
      lastFrameRef.current = timestamp;
      setCurrentTime((value) => {
        const next = value + delta;
        if (next >= duration) {
          if (!loop) { setIsPlaying(false); audioRef.current?.pause(); stopAllAudio(); return duration; }
          stopAllAudio();
          if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => undefined); } else { startSynth(0); }
          startMetronome(0);
          return 0;
        }
        return next;
      });
      animationRef.current = window.requestAnimationFrame(tick);
    }
    animationRef.current = window.requestAnimationFrame(tick);
    return () => { if (animationRef.current) window.cancelAnimationFrame(animationRef.current); };
  }, [duration, isPlaying, loop, speed, metronomeOn]);

  function getSynthContext() {
    if (typeof window === 'undefined') return null;
    if (!synthContextRef.current) {
      const browserWindow = window as WindowWithWebAudio;
      const Context = browserWindow.AudioContext || browserWindow.webkitAudioContext;
      synthContextRef.current = Context ? new Context() : null;
    }
    return synthContextRef.current;
  }

  async function startMic() {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setTuner({ frequency: null, cents: null, status: 'idle', feedback: 'Microfone indisponível' }); return; }
    try {
      const browserWindow = window as WindowWithWebAudio;
      const Context = browserWindow.AudioContext || browserWindow.webkitAudioContext;
      if (!Context) throw new Error('AudioContext unavailable');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const context = new Context();
      const source = context.createMediaStreamSource(stream);
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);
      micContextRef.current = context;
      analyserRef.current = analyserNode;
      micStreamRef.current = stream;
      setMicEnabled(true);
      setTuner({ frequency: null, cents: null, status: 'listening', feedback: 'Ouvindo sua voz' });
      listenToPitch(analyserNode, context);
    } catch { setTuner({ frequency: null, cents: null, status: 'idle', feedback: 'Permita o microfone' }); }
  }

  function stopMic() {
    if (micAnimationRef.current) window.cancelAnimationFrame(micAnimationRef.current);
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micContextRef.current?.close().catch(() => undefined);
    micAnimationRef.current = null; micStreamRef.current = null; micContextRef.current = null; analyserRef.current = null;
    setMicEnabled(false);
    setTuner({ frequency: null, cents: null, status: 'idle', feedback: 'Ative o afinador' });
  }

  function listenToPitch(analyserNode: AnalyserNode, audioContext: AudioContext) {
    const buffer = new Float32Array(analyserNode.fftSize);
    function loopPitch() {
      analyserNode.getFloatTimeDomainData(buffer);
      const frequency = autoCorrelate(buffer, audioContext.sampleRate);
      const currentTarget = targetFrequencyRef.current;
      if (!frequency || !currentTarget) {
        setTuner({ frequency: frequency || null, cents: null, status: 'listening', feedback: frequency ? 'Aguardando alvo' : 'Cante para detectar' });
      } else {
        const cents = 1200 * Math.log2(frequency / currentTarget);
        const abs = Math.abs(cents);
        const status: TunerStatus = abs <= 28 ? 'good' : cents < 0 ? 'low' : 'high';
        setTuner({ frequency, cents, status, feedback: abs <= 28 ? 'Perfeito' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' });
      }
      micAnimationRef.current = window.requestAnimationFrame(loopPitch);
    }
    loopPitch();
  }

  function clearCountIn() { countInTimeoutsRef.current.forEach((id) => window.clearTimeout(id)); countInTimeoutsRef.current = []; setIsCountingIn(false); setCountInBeat(null); }
  function stopAllAudio() { clearCountIn(); activeOscillatorsRef.current.forEach((oscillator) => { try { oscillator.stop(); } catch { /* ignored */ } }); activeOscillatorsRef.current = []; }

  function playClick(context: AudioContext, startsAt: number, strong = false) {
    const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = 'square'; oscillator.frequency.value = strong ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, startsAt); gain.gain.exponentialRampToValueAtTime(strong ? 0.22 : 0.14, startsAt + 0.006); gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.06);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(startsAt); oscillator.stop(startsAt + 0.08); activeOscillatorsRef.current.push(oscillator);
  }

  function playPianoNote(context: AudioContext, frequency: number, startsAt: number, endsAt: number) {
    const masterGain = context.createGain(); const toneFilter = context.createBiquadFilter(); toneFilter.type = 'lowpass'; toneFilter.frequency.setValueAtTime(4200, startsAt); toneFilter.frequency.exponentialRampToValueAtTime(1600, Math.max(startsAt + 0.12, endsAt - 0.02)); toneFilter.Q.value = 0.7; toneFilter.connect(masterGain); masterGain.connect(context.destination);
    masterGain.gain.setValueAtTime(0.0001, startsAt); masterGain.gain.exponentialRampToValueAtTime(0.34, startsAt + 0.008); masterGain.gain.exponentialRampToValueAtTime(0.12, startsAt + 0.22); masterGain.gain.setValueAtTime(0.08, Math.max(startsAt + 0.08, endsAt - 0.09)); masterGain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
    [
      { ratio: 1, gain: 0.75, detune: 0, type: 'triangle' as OscillatorType },
      { ratio: 2, gain: 0.22, detune: -5, type: 'sine' as OscillatorType },
      { ratio: 3, gain: 0.08, detune: 4, type: 'sine' as OscillatorType },
    ].forEach((partial) => {
      const oscillator = context.createOscillator(); const partialGain = context.createGain(); oscillator.type = partial.type; oscillator.frequency.value = frequency * partial.ratio; oscillator.detune.value = partial.detune; partialGain.gain.value = partial.gain; oscillator.connect(partialGain); partialGain.connect(toneFilter); oscillator.start(startsAt); oscillator.stop(endsAt + 0.04); activeOscillatorsRef.current.push(oscillator);
    });
  }

  function startSynth(startAt: number) {
    const context = getSynthContext(); if (!context) return; context.resume().catch(() => undefined); const now = context.currentTime + 0.04;
    exercise.notes.forEach((note) => { const frequency = pitchFrequency[note.pitch]; if (!frequency) return; const noteStart = (note.start - startAt) / speed; const noteEnd = noteStart + note.duration / speed; if (noteEnd <= 0) return; playPianoNote(context, frequency, now + Math.max(0, noteStart), now + Math.max(0.18, noteEnd)); });
  }

  function startMetronome(startAt: number) {
    if (!metronomeOn) return; const context = getSynthContext(); if (!context) return; context.resume().catch(() => undefined); const beatUnit = 60 / Math.max(1, exercise.bpm); const now = context.currentTime + 0.04; const firstBeatIndex = Math.max(0, Math.ceil(startAt / beatUnit));
    for (let beat = firstBeatIndex; beat * beatUnit <= duration; beat += 1) { const beatTime = beat * beatUnit; playClick(context, now + Math.max(0, (beatTime - startAt) / speed), beat % 4 === 0); }
  }

  function beginPlayback(startAt: number) { clearCountIn(); stopAllAudio(); setCurrentTime(startAt); if (audioRef.current) { audioRef.current.currentTime = startAt; audioRef.current.playbackRate = speed; audioRef.current.play().catch(() => undefined); } else { startSynth(startAt); } startMetronome(startAt); setIsPlaying(true); }
  function startCountInThenPlay(startAt: number) {
    const context = getSynthContext(); if (!context) return beginPlayback(startAt); stopAllAudio(); context.resume().catch(() => undefined); setIsCountingIn(true); const beatMs = (60 / Math.max(1, exercise.bpm) / speed) * 1000;
    [4, 3, 2, 1].forEach((value, index) => { const timeout = window.setTimeout(() => { setCountInBeat(value); playClick(context, context.currentTime + 0.01, value === 4); }, index * beatMs); countInTimeoutsRef.current.push(timeout); });
    const startTimeout = window.setTimeout(() => beginPlayback(startAt), 4 * beatMs); countInTimeoutsRef.current.push(startTimeout);
  }
  function togglePlayback() { if (isPlaying || isCountingIn) { audioRef.current?.pause(); stopAllAudio(); setIsPlaying(false); return; } const startAt = currentTime >= duration ? 0 : currentTime; startCountInThenPlay(startAt); }
  function restart() { audioRef.current?.pause(); stopAllAudio(); setIsPlaying(false); setCurrentTime(0); if (audioRef.current) audioRef.current.currentTime = 0; }

  return (
    <section className={`guided-player-card ${compact ? 'compact' : ''} tuner-${tuner.status}`}>
      <style>{css}</style>
      {exercise.audioUrl ? <audio ref={audioRef} src={exercise.audioUrl} loop={loop} /> : null}
      <div className="guided-player-top"><div><p className="eyebrow">Treinador vocal • piano • afinador • {exercise.bpm} BPM</p><h2>{exercise.title}</h2><p>{exercise.objective}</p></div><div className="guided-now"><span>{isCountingIn ? 'Contagem' : 'Alvo'}</span><strong>{isCountingIn ? countInBeat : activeNote?.label || activeNote?.pitch || 'Prepare'}</strong></div></div>
      {isCountingIn ? <div className="count-in-overlay"><span>{countInBeat}</span><small>prepare a entrada</small></div> : null}
      <div className="premium-tuner-stage" aria-label="Afinador visual do exercício">
        <div className="tuner-bg-glow" /><div className="tuner-center-line" />
        <div className="tuner-target-path">{exercise.notes.map((note, index) => { const left = (note.start / duration) * 100; const active = currentTime >= note.start && currentTime <= note.start + note.duration; return <span className={`target-point ${active ? 'active' : ''}`} key={`${note.pitch}-${index}`} style={{ left: `${left}%`, top: `${pitchToY(note.pitch)}%` }} />; })}</div>
        <div className="tuner-playhead" style={{ left: `${progress}%` }} />
        <div className="target-orb" style={{ top: `${targetY}%` }}><span>{activeNote?.pitch || '—'}</span></div>
        <div className="voice-orb" style={{ top: `${voiceY}%` }}><span /></div>
        <div className="tuner-feedback"><strong>{tuner.feedback}</strong><span>{centsDisplay}</span></div>
      </div>
      <div className="tuner-action-row"><button className={micEnabled ? 'mic active' : 'mic'} type="button" onClick={() => micEnabled ? stopMic() : startMic()}>{micEnabled ? 'Afinador ligado' : 'Ativar afinador'}</button><span>{micEnabled ? 'Cante e siga a bolinha dourada.' : 'Permita o microfone para acompanhar sua afinação.'}</span></div>
      <div className="guided-progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="guided-controls"><button className="primary" type="button" onClick={togglePlayback}>{isPlaying ? 'Pausar' : isCountingIn ? 'Cancelar' : 'Iniciar treino'}</button><button type="button" onClick={restart}>Recomeçar</button><button type="button" onClick={() => setLoop((value) => !value)}>{loop ? 'Loop ligado' : 'Loop desligado'}</button><button type="button" onClick={() => setMetronomeOn((value) => !value)}>{metronomeOn ? 'Metrônomo ligado' : 'Metrônomo desligado'}</button><label>Velocidade<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.75}>75%</option><option value={0.85}>85%</option><option value={1}>100%</option><option value={1.1}>110%</option></select></label><span className="guided-time">{formatTime(currentTime)} / {formatTime(duration)}</span></div>
    </section>
  );
}

const css = `.guided-player-card{position:relative;border:1px solid rgba(255,255,255,.13);border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));box-shadow:0 30px 90px rgba(0,0,0,.28);padding:20px;overflow:hidden}.guided-player-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.guided-player-top h2{font-family:Georgia,'Times New Roman',serif;font-size:clamp(30px,4.2vw,48px);line-height:.95;margin:8px 0 8px;letter-spacing:-.045em}.guided-player-top p{margin:0;color:#bfc0ca;max-width:620px;line-height:1.45}.guided-now{min-width:132px;border:1px solid rgba(245,199,107,.35);border-radius:20px;padding:14px;background:rgba(245,199,107,.08);text-align:center}.guided-now span{display:block;color:#cfc7aa;font-size:11px;text-transform:uppercase;font-weight:950;letter-spacing:.1em}.guided-now strong{display:block;color:#f5c76b;font-size:28px;margin-top:2px}.premium-tuner-stage{position:relative;height:470px;margin-top:18px;border-radius:34px;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:radial-gradient(circle at 50% 52%,rgba(245,199,107,.17),transparent 25%),linear-gradient(180deg,#1c2228,#0b0d10 60%,#050506)}.tuner-bg-glow{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 24%,rgba(0,0,0,.4)),radial-gradient(circle at 50% 80%,rgba(255,255,255,.12),transparent 28%)}.tuner-center-line{position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.18);box-shadow:0 0 18px rgba(255,255,255,.22)}.tuner-target-path{position:absolute;inset:18px}.target-point{position:absolute;width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 0 26px rgba(255,255,255,.5);transform:translate(-50%,-50%);opacity:.62}.target-point.active{width:30px;height:30px;opacity:1;background:#fff;box-shadow:0 0 44px rgba(255,255,255,.95)}.tuner-playhead{position:absolute;top:0;bottom:0;width:2px;background:rgba(245,199,107,.7);box-shadow:0 0 28px rgba(245,199,107,.8);z-index:3}.target-orb{position:absolute;right:32px;width:76px;height:76px;border-radius:50%;display:grid;place-items:center;transform:translateY(-50%);background:#fff;color:#111;font-weight:950;box-shadow:0 0 70px rgba(255,255,255,.52);z-index:4}.target-orb span{font-size:18px}.voice-orb{position:absolute;left:32px;width:58px;height:58px;border-radius:50%;transform:translateY(-50%);background:linear-gradient(180deg,#ffe39b,#e9b348);box-shadow:0 0 44px rgba(245,199,107,.62);z-index:5;transition:top .08s linear}.voice-orb span{position:absolute;inset:13px;border-radius:50%;background:rgba(255,255,255,.65)}.tuner-good .voice-orb{box-shadow:0 0 72px rgba(46,213,170,.9);background:linear-gradient(180deg,#bcffe9,#2ed5aa)}.tuner-feedback{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);text-align:center;padding:12px 20px;border-radius:999px;background:rgba(0,0,0,.36);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(12px)}.tuner-feedback strong{display:block;font-size:20px;color:#fff}.tuner-feedback span{display:block;color:#f5c76b;font-weight:950;margin-top:2px}.tuner-good .tuner-feedback strong{color:#7dffd7}.tuner-action-row{display:flex;align-items:center;gap:12px;justify-content:space-between;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(255,255,255,.04);padding:12px 14px;margin-top:14px}.tuner-action-row button{border:0;border-radius:999px;padding:12px 15px;font-weight:950;background:linear-gradient(180deg,#fff,#d9d9d9);color:#111}.tuner-action-row button.active{background:linear-gradient(180deg,#bcffe9,#2ed5aa);color:#06110d}.tuner-action-row span{color:#cfd0d8;font-size:13px}.count-in-overlay{position:absolute;inset:0;z-index:10;display:grid;place-items:center;background:rgba(0,0,0,.38);backdrop-filter:blur(10px);text-align:center}.count-in-overlay span{display:block;font-size:112px;font-weight:950;color:#f5c76b;text-shadow:0 0 44px rgba(245,199,107,.85);animation:countPulse .5s ease}.count-in-overlay small{display:block;text-transform:uppercase;letter-spacing:.14em;font-weight:950;color:#fff;margin-top:-30px}.guided-progress{height:8px;background:rgba(255,255,255,.08);border-radius:999px;margin:16px 2px 0;overflow:hidden}.guided-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ffe39b,#e9b348)}.guided-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}.guided-controls button,.guided-controls select{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;border-radius:14px;padding:11px 13px;font-weight:900}.guided-controls button.primary{border:0;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.guided-controls label{display:flex;align-items:center;gap:8px;color:#c7c7d1;font-size:13px;font-weight:800}.guided-time{margin-left:auto;color:#c7c7d1;font-weight:900}@keyframes countPulse{0%{transform:scale(.78);opacity:.4}100%{transform:scale(1);opacity:1}}@media(max-width:700px){.guided-player-card{padding:12px;border-radius:22px}.guided-player-top{display:grid}.guided-now{text-align:left}.premium-tuner-stage{height:540px;border-radius:26px}.target-orb{right:22px;width:64px;height:64px}.voice-orb{left:22px;width:52px;height:52px}.tuner-action-row{display:grid}.guided-time{margin-left:0;width:100%}}`;
