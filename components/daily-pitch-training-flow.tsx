'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';
import './daily-pitch-training.css';

type AudioCtor = typeof AudioContext;
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type Level = 0 | 1 | 2;
type Note = { name: string; hz: number };
const NOTES: Note[] = [{ name: 'C4', hz: 261.63 }, { name: 'D4', hz: 293.66 }, { name: 'E4', hz: 329.63 }, { name: 'F4', hz: 349.23 }, { name: 'G4', hz: 392 }, { name: 'A4', hz: 440 }];
const LEVELS = [{ title: 'Nível 1', sub: 'Encontrar o centro', goal: 'Encontre o centro da nota.', seconds: 1.1, tol: 28 }, { title: 'Nível 2', sub: 'Sustentar', goal: 'Mantenha a voz estável por 3 segundos.', seconds: 3, tol: 24 }, { title: 'Nível 3', sub: 'Ataque preciso', goal: 'Entre afinado sem escorregar.', seconds: 1.4, tol: 20 }] as const;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const cents = (freq: number, target: number) => 1200 * Math.log2(freq / target);

function getAudioCtor() {
  if (typeof window === 'undefined') return null;
  return (window as AudioWindow).AudioContext || (window as AudioWindow).webkitAudioContext || null;
}

function getPitch(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  if (Math.sqrt(rms / buffer.length) < 0.014) return null;
  let bestLag = -1;
  let best = 0;
  const minLag = Math.floor(sampleRate / 900);
  const maxLag = Math.floor(sampleRate / 75);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < buffer.length - lag; i++) sum += buffer[i] * buffer[i + lag];
    const corr = sum / (buffer.length - lag);
    if (corr > best) { best = corr; bestLag = lag; }
  }
  return bestLag > 0 && best > 0.0025 ? sampleRate / bestLag : null;
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
  const note = targets[level];
  const cfg = LEVELS[level];
  const centered = Math.abs(off) <= cfg.tol && running;
  const progress = clamp(hold / cfg.seconds, 0, 1);
  const ballX = `${50 + clamp(off / 75, -1, 1) * 8}%`;
  const ballY = `${50 + clamp(off / 75, -1, 1) * 35}%`;
  const meterX = `${50 + clamp(off / 90, -1, 1) * 44}%`;
  const feedback = !running ? 'Aguardando sua voz' : centered ? 'Afinado' : off < 0 ? 'Um pouco grave' : 'Um pouco agudo';

  useEffect(() => {
    const ctx = getSampleContext();
    if (ctx) void preloadPianoSamples(ctx, targets.map((target) => noteNameToMidi(target.name) ?? 60));
    return () => stop();
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
    await playPianoSample(ctx, midi, ctx.currentTime + 0.025, ctx.currentTime + 0.95, 1.08).catch(() => null);
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close().catch(() => null);
    stopPianoSamples(sampleCtxRef.current ?? undefined);
    rafRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    setRunning(false);
  }

  async function start() {
    stop();
    setDone(false); setHold(0); setOff(0); setRunning(true); setMsg(level === 2 ? 'Entre direto no centro.' : 'Aproxime a bolinha do centro.');
    attackRef.current = false; lastRef.current = performance.now(); if (!startRef.current) startRef.current = Date.now();
    void playReference(note);
    try {
      const Ctor = getAudioCtor();
      if (!Ctor) throw new Error('AudioContext indisponível');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.08; source.connect(analyser);
      streamRef.current = stream; ctxRef.current = ctx; loop(analyser, ctx.sampleRate);
    } catch { setMsg('Permita o microfone para medir sua afinação.'); setRunning(false); }
  }

  function loop(analyser: AnalyserNode, sampleRate: number) {
    const data = new Float32Array(analyser.fftSize);
    const tick = () => {
      const now = performance.now();
      const delta = Math.min(0.08, Math.max(0, (now - lastRef.current) / 1000));
      lastRef.current = now; analyser.getFloatTimeDomainData(data);
      const pitch = getPitch(data, sampleRate);
      if (!pitch) { setMsg('Cante para ativar o afinador.'); setHold((v) => Math.max(0, v - delta * .55)); }
      else {
        const c = clamp(cents(pitch, note.hz), -90, 90); setOff((old) => old * .62 + c * .38);
        const ok = Math.abs(c) <= cfg.tol;
        if (level === 2 && !attackRef.current) { attackRef.current = true; if (!ok) { setMsg(c < 0 ? 'Entrou grave. Tente de novo.' : 'Entrou agudo. Tente de novo.'); setTimeout(() => { stop(); setHold(0); }, 650); return; } }
        setMsg(ok ? (level === 1 ? 'Segure no centro.' : 'Centro encontrado.') : c < 0 ? 'Suba um pouco.' : 'Desça um pouco.');
        setHold((v) => ok ? Math.min(cfg.seconds, v + delta) : Math.max(0, v - delta * .9));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  useEffect(() => { if (running && hold >= cfg.seconds) { stop(); setDone(true); setMsg('Perfeito. Centro encaixado.'); setScore((s) => s.map((v, i) => i === level ? v + 1 : v)); } }, [hold, running, cfg.seconds, level]);

  function next() {
    if (level < 2) { setLevel((v) => (v + 1) as Level); setDone(false); setHold(0); setOff(0); setMsg('Toque para ouvir e cante no centro.'); return; }
    completeDailyStep(step, startRef.current ? (Date.now() - startRef.current) / 1000 : 1);
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  return <section className="pitch-premium-screen"><header className="pitch-top"><Link href="/aluno/central/diarios">Sair</Link><strong>Iniciante</strong><button type="button">i</button></header><main className="pitch-card"><div className="pitch-medal"><span>♢</span></div><button className="pitch-replay" type="button" onClick={() => void playReference()}>🔊<small>Ouvir</small></button><div className="pitch-heading"><span>Atividade 3</span><h1>Afinação</h1><p>Encontre o centro da nota e mantenha sua voz estável.</p></div><div className={`pitch-target-card ${centered ? 'is-centered' : ''}`}><span className="pitch-label">Nota alvo</span><strong>{note.name}</strong><div className="pitch-radar"><i className="ring outer"/><i className="ring inner"/><i className="cross horizontal"/><i className="cross vertical"/><b className="target-dot"/><b className={`voice-ball ${centered ? 'hit' : ''}`} style={{left:ballX,top:ballY}}/></div><em>{done ? 'Centro confirmado.' : running ? msg : 'Cante agora...'}</em></div><div className="pitch-feedback"><span>Feedback em tempo real</span><div className="pitch-meter" style={{'--meter-x':meterX} as React.CSSProperties}>{Array.from({length:19},(_,i)=><i key={i}/>)}<b/></div><div className="pitch-feedback-row"><small>Muito grave</small><strong>{feedback}</strong><small>Muito agudo</small></div></div><div className="pitch-level-card"><div className="pitch-level-icon">◎</div><div><strong>{cfg.title} · {cfg.sub}</strong><span>{cfg.goal}</span></div><em>{level+1}/3</em></div><div className="pitch-progress"><span style={{width:`${progress*100}%`}}/></div>{done?<button className="pitch-start" type="button" onClick={next}>{level<2?'Próximo nível':'Concluir atividade'} ›</button>:<button className="pitch-start" type="button" onClick={running?stop:start}>{running?'Pausar':'Iniciar atividade'}</button>}<div className="pitch-score"><span>Centro: {score[0]}</span><span>Estabilidade: {score[1]}</span><span>Ataque: {score[2]}</span></div></main></section>;
}
