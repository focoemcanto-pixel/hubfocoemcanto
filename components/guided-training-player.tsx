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

function pitchToY(pitch: string) {
  const index = pitchOrder.indexOf(pitch);
  if (index === -1) return 50;
  const percent = 86 - (index / Math.max(1, pitchOrder.length - 1)) * 72;
  return Math.max(10, Math.min(88, percent));
}

function formatTime(value: number) {
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function GuidedTrainingPlayer({ exercise, compact = false }: { exercise: TrainingExercise; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const synthContextRef = useRef<AudioContext | null>(null);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);
  const countInTimeoutsRef = useRef<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const duration = useMemo(() => getTrainingDurationSeconds(exercise), [exercise]);
  const activeNote = exercise.notes.find((note) => currentTime >= note.start && currentTime <= note.start + note.duration);
  const hasAudioFile = Boolean(exercise.audioUrl);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => () => stopAllAudio(), []);

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
          if (!loop) {
            setIsPlaying(false);
            audioRef.current?.pause();
            stopAllAudio();
            return duration;
          }
          stopAllAudio();
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => undefined);
          } else {
            startSynth(0);
          }
          startMetronome(0);
          return 0;
        }
        return next;
      });
      animationRef.current = window.requestAnimationFrame(tick);
    }

    animationRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
    };
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

  function clearCountIn() {
    countInTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    countInTimeoutsRef.current = [];
    setIsCountingIn(false);
    setCountInBeat(null);
  }

  function stopAllAudio() {
    clearCountIn();
    activeOscillatorsRef.current.forEach((oscillator) => {
      try { oscillator.stop(); } catch { /* oscillator already stopped */ }
    });
    activeOscillatorsRef.current = [];
  }

  function playClick(context: AudioContext, startsAt: number, strong = false) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = strong ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.22 : 0.14, startsAt + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.06);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + 0.08);
    activeOscillatorsRef.current.push(oscillator);
  }

  function playPianoNote(context: AudioContext, frequency: number, startsAt: number, endsAt: number) {
    const masterGain = context.createGain();
    const toneFilter = context.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.setValueAtTime(4200, startsAt);
    toneFilter.frequency.exponentialRampToValueAtTime(1600, Math.max(startsAt + 0.12, endsAt - 0.02));
    toneFilter.Q.value = 0.7;
    toneFilter.connect(masterGain);
    masterGain.connect(context.destination);
    masterGain.gain.setValueAtTime(0.0001, startsAt);
    masterGain.gain.exponentialRampToValueAtTime(0.34, startsAt + 0.008);
    masterGain.gain.exponentialRampToValueAtTime(0.12, startsAt + 0.22);
    masterGain.gain.setValueAtTime(0.08, Math.max(startsAt + 0.08, endsAt - 0.09));
    masterGain.gain.exponentialRampToValueAtTime(0.0001, endsAt);

    [
      { ratio: 1, gain: 0.75, detune: 0, type: 'triangle' as OscillatorType },
      { ratio: 2, gain: 0.22, detune: -5, type: 'sine' as OscillatorType },
      { ratio: 3, gain: 0.08, detune: 4, type: 'sine' as OscillatorType },
    ].forEach((partial) => {
      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      oscillator.type = partial.type;
      oscillator.frequency.value = frequency * partial.ratio;
      oscillator.detune.value = partial.detune;
      partialGain.gain.value = partial.gain;
      oscillator.connect(partialGain);
      partialGain.connect(toneFilter);
      oscillator.start(startsAt);
      oscillator.stop(endsAt + 0.04);
      activeOscillatorsRef.current.push(oscillator);
    });
  }

  function startSynth(startAt: number) {
    const context = getSynthContext();
    if (!context) return;
    context.resume().catch(() => undefined);
    const now = context.currentTime + 0.04;
    exercise.notes.forEach((note) => {
      const frequency = pitchFrequency[note.pitch];
      if (!frequency) return;
      const noteStart = (note.start - startAt) / speed;
      const noteEnd = noteStart + note.duration / speed;
      if (noteEnd <= 0) return;
      playPianoNote(context, frequency, now + Math.max(0, noteStart), now + Math.max(0.18, noteEnd));
    });
  }

  function startMetronome(startAt: number) {
    if (!metronomeOn) return;
    const context = getSynthContext();
    if (!context) return;
    context.resume().catch(() => undefined);
    const beatSeconds = (60 / Math.max(1, exercise.bpm)) / speed;
    const now = context.currentTime + 0.04;
    const firstBeatIndex = Math.max(0, Math.ceil(startAt / (60 / Math.max(1, exercise.bpm))));
    for (let beat = firstBeatIndex; beat * (60 / Math.max(1, exercise.bpm)) <= duration; beat += 1) {
      const beatTime = beat * (60 / Math.max(1, exercise.bpm));
      const scheduled = now + Math.max(0, (beatTime - startAt) / speed);
      playClick(context, scheduled, beat % 4 === 0);
    }
  }

  function beginPlayback(startAt: number) {
    clearCountIn();
    stopAllAudio();
    setCurrentTime(startAt);
    if (audioRef.current) {
      audioRef.current.currentTime = startAt;
      audioRef.current.playbackRate = speed;
      audioRef.current.play().catch(() => undefined);
    } else {
      startSynth(startAt);
    }
    startMetronome(startAt);
    setIsPlaying(true);
  }

  function startCountInThenPlay(startAt: number) {
    const context = getSynthContext();
    if (!context) return beginPlayback(startAt);
    stopAllAudio();
    context.resume().catch(() => undefined);
    setIsCountingIn(true);
    const beatMs = (60 / Math.max(1, exercise.bpm) / speed) * 1000;
    [4, 3, 2, 1].forEach((value, index) => {
      const timeout = window.setTimeout(() => {
        setCountInBeat(value);
        playClick(context, context.currentTime + 0.01, value === 4);
      }, index * beatMs);
      countInTimeoutsRef.current.push(timeout);
    });
    const startTimeout = window.setTimeout(() => beginPlayback(startAt), 4 * beatMs);
    countInTimeoutsRef.current.push(startTimeout);
  }

  function togglePlayback() {
    if (isPlaying || isCountingIn) {
      audioRef.current?.pause();
      stopAllAudio();
      setIsPlaying(false);
      return;
    }
    const startAt = currentTime >= duration ? 0 : currentTime;
    startCountInThenPlay(startAt);
  }

  function restart() {
    audioRef.current?.pause();
    stopAllAudio();
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }

  const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  return (
    <section className={`guided-player-card ${compact ? 'compact' : ''}`}>
      <style>{css}</style>
      {exercise.audioUrl ? <audio ref={audioRef} src={exercise.audioUrl} loop={loop} /> : null}
      <div className="guided-player-top">
        <div>
          <p className="eyebrow">Player guiado • piano • metrônomo • {exercise.bpm} BPM</p>
          <h2>{exercise.title}</h2>
          <p>{exercise.objective}</p>
        </div>
        <div className="guided-now"><span>{isCountingIn ? 'Contagem' : 'Agora'}</span><strong>{isCountingIn ? countInBeat : activeNote?.label || activeNote?.pitch || 'Prepare'}</strong></div>
      </div>
      {!hasAudioFile ? <p className="synth-notice">Piano provisório gerado pelo app até o áudio oficial ser cadastrado.</p> : null}
      {isCountingIn ? <div className="count-in-overlay"><span>{countInBeat}</span><small>prepare a entrada</small></div> : null}
      <div className="note-stage" aria-label="Guia visual de notas">
        <div className="stage-grid" />
        <div className="playhead" style={{ left: `${progress}%` }} />
        {exercise.notes.map((note, index) => {
          const left = (note.start / duration) * 100;
          const width = Math.max(4, (note.duration / duration) * 100);
          const active = currentTime >= note.start && currentTime <= note.start + note.duration;
          return <div className={`guided-note ${active ? 'active' : ''}`} key={`${note.pitch}-${note.start}-${index}`} style={{ left: `${left}%`, top: `${pitchToY(note.pitch)}%`, width: `${width}%` }}><span>{note.label || note.pitch}</span></div>;
        })}
      </div>
      <div className="guided-progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="guided-controls">
        <button className="primary" type="button" onClick={togglePlayback}>{isPlaying ? 'Pausar' : isCountingIn ? 'Cancelar' : 'Iniciar treino'}</button>
        <button type="button" onClick={restart}>Recomeçar</button>
        <button type="button" onClick={() => setLoop((value) => !value)}>{loop ? 'Loop ligado' : 'Loop desligado'}</button>
        <button type="button" onClick={() => setMetronomeOn((value) => !value)}>{metronomeOn ? 'Metrônomo ligado' : 'Metrônomo desligado'}</button>
        <label>Velocidade<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.75}>75%</option><option value={0.85}>85%</option><option value={1}>100%</option><option value={1.1}>110%</option></select></label>
        <span className="guided-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
    </section>
  );
}

const css = `.guided-player-card{position:relative;border:1px solid rgba(255,255,255,.13);border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));box-shadow:0 30px 90px rgba(0,0,0,.28);padding:20px;overflow:hidden}.guided-player-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.guided-player-top h2{font-family:Georgia,'Times New Roman',serif;font-size:clamp(30px,4.2vw,48px);line-height:.95;margin:8px 0 8px;letter-spacing:-.045em}.guided-player-top p{margin:0;color:#bfc0ca;max-width:620px;line-height:1.45}.guided-now{min-width:132px;border:1px solid rgba(245,199,107,.35);border-radius:20px;padding:14px;background:rgba(245,199,107,.08);text-align:center}.guided-now span{display:block;color:#cfc7aa;font-size:11px;text-transform:uppercase;font-weight:950;letter-spacing:.1em}.guided-now strong{display:block;color:#f5c76b;font-size:28px;margin-top:2px}.synth-notice{margin:14px 0 0;color:#f5c76b;font-size:12px;font-weight:900}.count-in-overlay{position:absolute;inset:0;z-index:10;display:grid;place-items:center;background:rgba(0,0,0,.38);backdrop-filter:blur(10px);text-align:center}.count-in-overlay span{display:block;font-size:112px;font-weight:950;color:#f5c76b;text-shadow:0 0 44px rgba(245,199,107,.85);animation:countPulse .5s ease}.count-in-overlay small{display:block;text-transform:uppercase;letter-spacing:.14em;font-weight:950;color:#fff;margin-top:-30px}.note-stage{position:relative;height:340px;margin-top:20px;border:1px solid rgba(255,255,255,.12);border-radius:26px;background:radial-gradient(circle at 50% 50%,rgba(245,199,107,.1),transparent 34%),linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,.18));overflow:hidden}.stage-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:100% 48px,9.09% 100%;opacity:.7}.playhead{position:absolute;top:0;bottom:0;width:2px;background:#f5c76b;box-shadow:0 0 18px rgba(245,199,107,.9);z-index:3}.guided-note{position:absolute;z-index:2;height:26px;min-width:38px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.24);box-shadow:0 12px 35px rgba(0,0,0,.34);transform:translateY(-50%);transition:.16s ease;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:950}.guided-note:before{content:'';position:absolute;left:0;top:50%;width:26px;height:26px;border-radius:50%;transform:translateY(-50%);background:linear-gradient(180deg,#fff0b6,#e9b348);box-shadow:0 0 22px rgba(245,199,107,.68)}.guided-note span{position:relative;z-index:1;margin-left:18px;text-shadow:0 1px 8px #000}.guided-note.active{background:rgba(245,199,107,.22);border-color:rgba(245,199,107,.78);transform:translateY(-50%) scale(1.06)}.guided-note.active:before{box-shadow:0 0 34px rgba(245,199,107,1)}.guided-progress{height:8px;background:rgba(255,255,255,.08);border-radius:999px;margin:16px 2px 0;overflow:hidden}.guided-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ffe39b,#e9b348)}.guided-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}.guided-controls button,.guided-controls select{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;border-radius:14px;padding:11px 13px;font-weight:900}.guided-controls button.primary{border:0;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.guided-controls label{display:flex;align-items:center;gap:8px;color:#c7c7d1;font-size:13px;font-weight:800}.guided-time{margin-left:auto;color:#c7c7d1;font-weight:900}.guided-player-card.compact .note-stage{height:390px;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.08));border-color:rgba(255,255,255,.08)}.guided-player-card.compact .synth-notice{display:none}@keyframes countPulse{0%{transform:scale(.78);opacity:.4}100%{transform:scale(1);opacity:1}}@media(max-width:700px){.guided-player-card{padding:14px;border-radius:22px}.guided-player-top{display:grid}.guided-now{text-align:left}.note-stage{height:280px;border-radius:20px}.guided-player-card.compact .note-stage{height:420px}.guided-time{margin-left:0;width:100%}}`;
