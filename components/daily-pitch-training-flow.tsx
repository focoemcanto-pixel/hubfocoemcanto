'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';
import './daily-pitch-training.css';
import './daily-pitch-training-fixes.css';

type AudioCtor = typeof AudioContext;
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type Level = 0 | 1 | 2;
type Note = { name: string; hz: number };
const NOTES: Note[] = [{ name: 'C4', hz: 261.63 }, { name: 'D4', hz: 293.66 }, { name: 'E4', hz: 329.63 }, { name: 'F4', hz: 349.23 }, { name: 'G4', hz: 392 }, { name: 'A4', hz: 440 }];
const LEVELS = [{ title: 'Nível 1', sub: 'Encontrar o centro', goal: 'Encontre o centro da nota.', seconds: 1.2, tol: 40 }, { title: 'Nível 2', sub: 'Sustentar', goal: 'Mantenha a voz estável por 3 segundos.', seconds: 2.7, tol: 36 }, { title: 'Nível 3', sub: 'Ataque preciso', goal: 'Entre afinado sem escorregar.', seconds: 1.55, tol: 32 }] as const;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const cents = (freq: number, target: number) => 1200 * Math.log2(freq / target);

function getAudioCtor() {
  if (typeof window === 'undefined') return null;
  return (window as AudioWindow).AudioContext || (window as AudioWindow).webkitAudioContext || null;
}

function getPitch(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  if (Math.sqrt(rms / buffer.length) < 0.01) return null;
  let bestLag = -1;
  let best = 0;
  const minLag = Math.floor(sampleRate / 900);
  const maxLag = Math.floor(sampleRate / 70);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let energy = 0;
    for (let i = 0; i < buffer.length - lag; i++) { sum += buffer[i] * buffer[i + lag]; energy += buffer[i] * buffer[i] + buffer[i + lag] * buffer[i + lag]; }
    const corr = energy > 0 ? (2 * sum) / energy : 0;
    if (corr > best) { best = corr; bestLag = lag; }
  }
  return bestLag > 0 && best > 0.18 ? sampleRate / bestLag : null;
}

export function DailyPitchTrainingFlow({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const seed = useMemo(() => [...exercise.slug, String(step.day)].reduce((a, c) => a + c.charCodeAt(0), 0), [exercise.slug, step.day]);
  const targets = useMemo(() => [0, 2, 4].map((offset) => NOTES[(seed + offset) % NOTES.length]), [seed]);
  const [level, setLevel] = useState<Level>(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [off, setOff] = useState(0);
  const [hold, setHold] = useState(0);
  const [msg, setMsg] = useState('Toque para ouvir e cante no centro.');
  const [score, setScore] = useState([0, 0, 0]);
  const ctxRef = useRef<AudioContext | null>(null);
  const sampleCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const attackRef = useRef(false);
  const offRef = useRef(0);
  const holdRef = useRef(0);
  const note = targets[level];
  const cfg = LEVELS[level];
  const centered = Math.abs(off) <= cfg.tol && running;
  const progress = clamp(hold / cfg.seconds, 0, 1);
  const ballX = `${50 + clamp(off / 95, -1, 1) * 9}%`;
  const ballY = `${50 + clamp(off / 95, -1, 1) * 34}%`;
  const meterX = `${50 + clamp(off / 110, -1, 1) * 44}%`;
  const feedback = !running ? 'Aguardando sua voz' : centered ? `Afinado · ${Math.round(progress * 100)}%` : off < 0 ? 'Um pouco grave' : 'Um pouco agudo';

  useEffect(() => {
    const ctx = getSampleContext();
    if (ctx) void preloadPianoSamples(ctx, targets.map((target) => noteNameToMidi(target.name) ?? 60));
    return () => stopMic();
  }, [targets]);

  function getSampleContext() {
    if (sampleCtxRef.current) return sampleCtxRef.current;
    const Ctor = getAudioCtor();
    sampleCtxRef.current = Ctor ? new Ctor() : null;
    return sampleCtxRef.current;
  }

  async function playReference(target = note) {
    const ctx = getSampleContext();
    if (!ctx) return;
    await ctx.resume().catch(() => null);
    stopPianoSamples(ctx);
    const midi = noteNameToMidi(target.name) ?? 60;
    await preloadPianoSamples(ctx, [midi]).catch(() => null);
    await playPianoSample(ctx, midi, ctx.currentTime + 0.035, ctx.currentTime + 2.85, 1.08).catch(() => null);
  }

  function stopMic() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close().catch(() => null);
    rafRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    setRunning(false);
  }

  async function start(targetLevel: Level = level) {
    stopMic();
    const targetNote = targets[targetLevel];
    const targetCfg = LEVELS[targetLevel];
    offRef.current = 0; holdRef.current = 0;
    setDone(false); setHold(0); setOff(0); setRunning(true); setMsg(targetLevel === 2 ? 'Entre direto no centro.' : 'Aproxime a bolinha do centro.');
    attackRef.current = false; lastRef.current = performance.now(); if (!startRef.current) startRef.current = Date.now();
    try {
      const Ctor = getAudioCtor();
      if (!Ctor) throw new Error('AudioContext indisponível');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.04; source.connect(analyser);
      streamRef.current = stream; ctxRef.current = ctx;
      await playReference(targetNote);
      loop(analyser, ctx.sampleRate, targetLevel, targetNote, targetCfg);
    } catch { setMsg('Permita o microfone para medir sua afinação.'); setRunning(false); }
  }

  function loop(analyser: AnalyserNode, sampleRate: number, activeLevel: Level, targetNote: Note, targetCfg: typeof LEVELS[number]) {
    const data = new Float32Array(analyser.fftSize);
    const tick = () => {
      const now = performance.now();
      const delta = Math.min(0.05, Math.max(0, (now - lastRef.current) / 1000));
      lastRef.current = now; analyser.getFloatTimeDomainData(data);
      const pitch = getPitch(data, sampleRate);
      if (!pitch) {
        setMsg('Cante para ativar o afinador.');
        holdRef.current = Math.max(0, holdRef.current - delta * .24);
        setHold(holdRef.current);
      } else {
        const raw = clamp(cents(pitch, targetNote.hz), -110, 110);
        const smooth = offRef.current * .82 + raw * .18;
        offRef.current = smooth;
        setOff(smooth);
        const ok = Math.abs(smooth) <= targetCfg.tol;
        if (activeLevel === 2 && !attackRef.current) { attackRef.current = true; if (!ok && Math.abs(smooth) > targetCfg.tol + 18) { setMsg(smooth < 0 ? 'Entrou grave. Refaça o ataque.' : 'Entrou agudo. Refaça o ataque.'); holdRef.current = 0; setHold(0); } }
        setMsg(ok ? (activeLevel === 1 ? 'Segure no centro.' : 'Centro encontrado.') : smooth < 0 ? 'Suba um pouco.' : 'Desça um pouco.');
        const nextHold = ok ? Math.min(targetCfg.seconds, holdRef.current + delta) : Math.max(0, holdRef.current - delta * .30);
        holdRef.current = nextHold;
        setHold(nextHold);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  useEffect(() => { if (running && hold >= cfg.seconds) { stopMic(); setDone(true); setMsg('Perfeito. Centro encaixado.'); setScore((s) => s.map((v, i) => i === level ? v + 1 : v)); } }, [hold, running, cfg.seconds, level]);

  function next() {
    if (level < 2) {
      const nextLevel = (level + 1) as Level;
      setLevel(nextLevel); setDone(false); setHold(0); setOff(0); setMsg('Preparando próximo nível...');
      window.setTimeout(() => void start(nextLevel), 140);
      return;
    }
    completeDailyStep(step, startRef.current ? (Date.now() - startRef.current) / 1000 : 1);
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  return <section className="pitch-premium-screen"><header className="pitch-top"><Link href="/aluno/central/diarios">Sair</Link><strong>Iniciante</strong><button type="button">i</button></header><main className="pitch-card"><div className="pitch-medal"><span>♢</span></div><button className="pitch-replay" type="button" onClick={() => void playReference()}>🔊<small>Ouvir</small></button><div className="pitch-heading"><span>Atividade 3</span><h1>Afinação</h1><p>Encontre o centro da nota e mantenha sua voz estável.</p></div><div className={`pitch-target-card ${centered ? 'is-centered' : ''}`}><span className="pitch-label">Nota alvo</span><strong>{note.name}</strong><div className="pitch-radar" style={{'--hold-progress':`${Math.round(progress*360)}deg`} as React.CSSProperties}><i className="ring outer"/><i className="ring inner"/><i className="ring load"/><i className="cross horizontal"/><i className="cross vertical"/><b className="target-dot"/><b className={`voice-ball ${centered ? 'hit' : ''}`} style={{left:ballX,top:ballY}}/></div><em>{done ? 'Centro confirmado.' : running ? msg : 'Cante agora...'}</em></div><div className="pitch-feedback"><span>Feedback em tempo real</span><div className="pitch-meter" style={{'--meter-x':meterX} as React.CSSProperties}>{Array.from({length:19},(_,i)=><i key={i}/>)}<b/></div><div className="pitch-feedback-row"><small>Muito grave</small><strong>{feedback}</strong><small>Muito agudo</small></div></div><div className="pitch-level-card"><div className="pitch-level-icon">◎</div><div><strong>{cfg.title} · {cfg.sub}</strong><span>{cfg.goal}</span></div><em>{level+1}/3</em></div><div className="pitch-progress"><span style={{width:`${progress*100}%`}}/></div>{done?<button className="pitch-start" type="button" onClick={next}>{level<2?'Próximo nível':'Concluir atividade'} ›</button>:<button className="pitch-start" type="button" onClick={running?stopMic:start}>{running?'Pausar':'Iniciar atividade'}</button>}<div className="pitch-score"><span>Centro: {score[0]}</span><span>Estabilidade: {score[1]}</span><span>Ataque: {score[2]}</span></div></main></section>;
}
