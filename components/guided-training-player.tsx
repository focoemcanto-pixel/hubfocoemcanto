'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrainingExercise } from '@/lib/training-center';
import { getTrainingDurationSeconds } from '@/lib/training-center';

const pitchOrder = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

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

export function GuidedTrainingPlayer({ exercise }: { exercise: TrainingExercise }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const duration = useMemo(() => getTrainingDurationSeconds(exercise), [exercise]);
  const activeNote = exercise.notes.find((note) => currentTime >= note.start && currentTime <= note.start + note.duration);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

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
            return duration;
          }
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => undefined);
          }
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
  }, [duration, isPlaying, loop, speed]);

  function togglePlayback() {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    const startAt = currentTime >= duration ? 0 : currentTime;
    setCurrentTime(startAt);
    if (audioRef.current) {
      audioRef.current.currentTime = startAt;
      audioRef.current.playbackRate = speed;
      audioRef.current.play().catch(() => undefined);
    }
    setIsPlaying(true);
  }

  function restart() {
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }

  const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  return (
    <section className="guided-player-card">
      <style>{css}</style>
      {exercise.audioUrl ? <audio ref={audioRef} src={exercise.audioUrl} loop={loop} /> : null}
      <div className="guided-player-top">
        <div>
          <p className="eyebrow">Player guiado • {exercise.bpm} BPM</p>
          <h2>{exercise.title}</h2>
          <p>{exercise.objective}</p>
        </div>
        <div className="guided-now">
          <span>Agora</span>
          <strong>{activeNote?.label || activeNote?.pitch || 'Prepare'}</strong>
        </div>
      </div>

      <div className="note-stage" aria-label="Guia visual de notas">
        <div className="stage-grid" />
        <div className="playhead" style={{ left: `${progress}%` }} />
        {exercise.notes.map((note, index) => {
          const left = (note.start / duration) * 100;
          const width = Math.max(4, (note.duration / duration) * 100);
          const active = currentTime >= note.start && currentTime <= note.start + note.duration;
          return (
            <div
              className={`guided-note ${active ? 'active' : ''}`}
              key={`${note.pitch}-${note.start}-${index}`}
              style={{ left: `${left}%`, top: `${pitchToY(note.pitch)}%`, width: `${width}%` }}
            >
              <span>{note.label || note.pitch}</span>
            </div>
          );
        })}
      </div>

      <div className="guided-progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="guided-controls">
        <button className="primary" type="button" onClick={togglePlayback}>{isPlaying ? 'Pausar' : 'Iniciar treino'}</button>
        <button type="button" onClick={restart}>Recomeçar</button>
        <button type="button" onClick={() => setLoop((value) => !value)}>{loop ? 'Loop ligado' : 'Loop desligado'}</button>
        <label>
          Velocidade
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={0.75}>75%</option>
            <option value={0.85}>85%</option>
            <option value={1}>100%</option>
            <option value={1.1}>110%</option>
          </select>
        </label>
        <span className="guided-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
    </section>
  );
}

const css = `.guided-player-card{border:1px solid rgba(255,255,255,.13);border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));box-shadow:0 30px 90px rgba(0,0,0,.28);padding:20px;overflow:hidden}.guided-player-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.guided-player-top h2{font-family:Georgia,'Times New Roman',serif;font-size:clamp(30px,4.2vw,48px);line-height:.95;margin:8px 0 8px;letter-spacing:-.045em}.guided-player-top p{margin:0;color:#bfc0ca;max-width:620px;line-height:1.45}.guided-now{min-width:132px;border:1px solid rgba(245,199,107,.35);border-radius:20px;padding:14px;background:rgba(245,199,107,.08);text-align:center}.guided-now span{display:block;color:#cfc7aa;font-size:11px;text-transform:uppercase;font-weight:950;letter-spacing:.1em}.guided-now strong{display:block;color:#f5c76b;font-size:28px;margin-top:2px}.note-stage{position:relative;height:340px;margin-top:20px;border:1px solid rgba(255,255,255,.12);border-radius:26px;background:radial-gradient(circle at 50% 50%,rgba(245,199,107,.1),transparent 34%),linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,.18));overflow:hidden}.stage-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:100% 48px,9.09% 100%;opacity:.7}.playhead{position:absolute;top:0;bottom:0;width:2px;background:#f5c76b;box-shadow:0 0 18px rgba(245,199,107,.9);z-index:3}.guided-note{position:absolute;z-index:2;height:26px;min-width:38px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.24);box-shadow:0 12px 35px rgba(0,0,0,.34);transform:translateY(-50%);transition:.16s ease;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:950}.guided-note:before{content:'';position:absolute;left:0;top:50%;width:26px;height:26px;border-radius:50%;transform:translateY(-50%);background:linear-gradient(180deg,#fff0b6,#e9b348);box-shadow:0 0 22px rgba(245,199,107,.68)}.guided-note span{position:relative;z-index:1;margin-left:18px;text-shadow:0 1px 8px #000}.guided-note.active{background:rgba(245,199,107,.22);border-color:rgba(245,199,107,.78);transform:translateY(-50%) scale(1.06)}.guided-note.active:before{box-shadow:0 0 34px rgba(245,199,107,1)}.guided-progress{height:8px;background:rgba(255,255,255,.08);border-radius:999px;margin:16px 2px 0;overflow:hidden}.guided-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ffe39b,#e9b348)}.guided-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}.guided-controls button,.guided-controls select{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;border-radius:14px;padding:11px 13px;font-weight:900}.guided-controls button.primary{border:0;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.guided-controls label{display:flex;align-items:center;gap:8px;color:#c7c7d1;font-size:13px;font-weight:800}.guided-time{margin-left:auto;color:#c7c7d1;font-weight:900}@media(max-width:700px){.guided-player-card{padding:14px;border-radius:22px}.guided-player-top{display:grid}.guided-now{text-align:left}.note-stage{height:280px;border-radius:20px}.guided-time{margin-left:0;width:100%}}`;
