'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { GuidedTrainingPlayer } from '@/components/guided-training-player';
import { completeDailyStep } from '@/lib/daily-training-progress';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

const accentMap = {
  gold: { glow: 'rgba(245,199,107,.34)', color: '#f5c76b' },
  teal: { glow: 'rgba(38,224,196,.32)', color: '#26e0c4' },
  purple: { glow: 'rgba(155,76,255,.32)', color: '#a855f7' },
};

const activityNames = ['Aquecimento', 'Respiração', 'Afinação', 'Percepção'];
type DailyStyle = CSSProperties & { '--daily-glow': string; '--daily-accent': string; '--breath-progress'?: string };
type DailyStage = 'instruction' | 'training';
type BreathStatus = 'idle' | 'running' | 'broken' | 'completed';
type AudioCtor = typeof AudioContext;
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };

function clamp(value: number, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }

function BreathPractice({ step }: { step: DailyTrainingStep }) {
  const router = useRouter();
  const [status, setStatus] = useState<BreathStatus>('idle');
  const [left, setLeft] = useState(30);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState('Prepare o ar e solte em S contínuo');
  const [reached, setReached] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const lastLeftRef = useRef(30);
  const lowFramesRef = useRef(0);

  useEffect(() => () => stopAudio(), []);

  function stopAudio() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => null);
    ctxRef.current = null;
  }

  function goToConclusion() {
    stopAudio();
    completeDailyStep(step, Math.max(1, reached || 30 - lastLeftRef.current));
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  function pauseAtCurrentTime(kind: 'broken' | 'completed') {
    const elapsed = clamp(30 - lastLeftRef.current, 0, 30);
    stopAudio();
    setReached(elapsed);
    setLeft(30 - elapsed);
    setStatus(kind);
    setLevel(0);
    setMessage(kind === 'completed' ? 'Concluído: 30 seg / 30 seg!' : `Quebrou em ${Math.max(1, Math.floor(elapsed))} seg / 30 seg!`);
  }

  async function start() {
    stopAudio();
    setStatus('running');
    setLeft(30);
    lastLeftRef.current = 30;
    lowFramesRef.current = 0;
    setReached(0);
    setLevel(0);
    setMessage('Ativando microfone...');
    startedAtRef.current = performance.now();
    try {
      const Ctor = (window as AudioWindow).AudioContext || (window as AudioWindow).webkitAudioContext;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.16;
      source.connect(analyser);
      streamRef.current = stream;
      ctxRef.current = ctx;
      readBreath(analyser);
    } catch {
      setMessage('Permita o microfone para medir o S');
      setStatus('idle');
    }
  }

  function readBreath(analyser: AnalyserNode) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const elapsed = (performance.now() - startedAt) / 1000;
      const remaining = Math.max(0, 30 - elapsed);
      analyser.getByteFrequencyData(data);
      let sum = 0;
      const startBin = Math.floor(data.length * 0.32);
      for (let i = startBin; i < data.length; i += 1) sum += data[i];
      const avg = sum / Math.max(1, data.length - startBin);
      const detected = clamp((avg - 6) / 58);
      const cleanLevel = detected < 0.06 ? 0 : detected;
      setLevel((old) => old * 0.58 + cleanLevel * 0.42);
      setMessage(cleanLevel > 0.14 ? (cleanLevel > 0.74 ? 'Muito forte, deixe mais constante' : 'Continue sustentando') : 'Mantenha o S mais constante');
      lastLeftRef.current = remaining;
      setLeft(remaining);
      if (remaining <= 0) return pauseAtCurrentTime('completed');
      if (elapsed > 1.2 && cleanLevel < 0.1) lowFramesRef.current += 1;
      else lowFramesRef.current = 0;
      if (lowFramesRef.current > 14) return pauseAtCurrentTime('broken');
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  }

  const progress = ((30 - left) / 30) * 360;
  const bars = Array.from({ length: 9 }, (_, index) => index);
  const isStopped = status === 'broken' || status === 'completed';

  return (
    <section className="breath-screen">
      <style>{css}</style>
      <Link className="breath-back" href="/aluno/central/diarios">←</Link>
      <h1>Exercício de Respiração</h1>
      <strong className="breath-time">{isStopped ? message : `${Math.ceil(left)} seg`}</strong>
      <div className="breath-ring" style={{ '--breath-progress': `${progress}deg` } as DailyStyle}>
        <div className="breath-bars">{bars.map((bar) => <i key={bar} className={level * 9 > bar ? 'on' : ''} />)}<b /></div>
        <span>Nível de Respiração</span>
      </div>
      {!isStopped ? <p>{status === 'running' ? message : 'Prepare o ar e solte em S contínuo'}</p> : null}
      {isStopped ? <div className="breath-result-actions"><button type="button" onClick={goToConclusion}>Terminar</button><button type="button" onClick={start}>Tentar Novamente</button></div> : <button type="button" onClick={status === 'running' ? () => pauseAtCurrentTime('broken') : start}>{status === 'running' ? 'Parar' : 'Iniciar'}</button>}
    </section>
  );
}

export function DailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);
  const [stage, setStage] = useState<DailyStage>('instruction');
  const accent = accentMap[step.accent];
  const nextExercise = step.exerciseNumber < total ? step.exerciseNumber + 1 : null;
  const activityName = activityNames[step.exerciseNumber - 1] || 'Treino';
  const isBreathing = exercise.categorySlug === 'respiracao';
  const style = { '--daily-glow': accent.glow, '--daily-accent': accent.color } as DailyStyle;

  function startTraining() { startedAtRef.current = Date.now(); setStage('training'); }
  function finishTraining() {
    const durationSeconds = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 1;
    completeDailyStep(step, durationSeconds);
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  if (stage === 'training') {
    if (isBreathing) return <BreathPractice step={step} />;
    return <section className="daily-training-screen"><style>{css}</style><GuidedTrainingPlayer exercise={exercise} compact /><button className="finish-hidden" type="button" onClick={finishTraining}>Concluir exercício</button>{nextExercise ? <Link className="finish-hidden-link" href={`/aluno/central/diarios/${nextExercise}`} prefetch>Próximo</Link> : null}</section>;
  }

  return (
    <section className="daily-immersive" style={style}>
      <style>{css}</style>
      <div className="daily-top-line"><Link href="/aluno/central/diarios" prefetch>←</Link><span>Treino Diário</span><strong>Dia {step.day}</strong></div>
      <div className="daily-screen-panel instruction-panel">
        <p className="daily-kicker">Atividade {step.exerciseNumber} de {total}</p>
        <h1>Atividade {step.exerciseNumber}</h1>
        <p className="daily-activity-name">({activityName})</p>
        <div className="video-placeholder"><div className="video-icon">▶</div><strong>Vídeo do professor</strong><span>Espaço reservado para a explicação em vídeo.</span></div>
        {isBreathing ? <div className="paper-card compact-paper"><span>Exercício de apoio respiratório</span><strong>Sustentação em S</strong><p>30 seg</p><small>Solte o ar em S contínuo. O círculo marca o tempo e a barra mostra o nível do fluxo.</small></div> : <div className="paper-card compact-paper"><span>Exercício personalizado para você</span><strong>Tessitura do treino</strong><p>E3 → G5</p><small>Gerado para percorrer sua região confortável, preparando sua voz sem esforço e respeitando seus limites atuais.</small></div>}
        <div className="instruction-grid"><div className="instruction-card"><h2>Como fazer</h2><p>{isBreathing ? 'Inspire com calma e solte o ar em S contínuo, sem empurrar e sem apertar o pescoço.' : 'Faça boca chiusa: som de “Mmm” com os lábios fechados, sentindo vibração leve no rosto e sem buscar volume.'}</p></div><div className="instruction-card"><h2>Durante o exercício</h2><ul><li>Mantenha pouco esforço.</li><li>Não aperte o pescoço.</li><li>Siga o guia visual.</li><li>Continue até o tempo finalizar.</li></ul></div><div className="instruction-card"><h2>Como saber se está certo</h2><ul><li>Sensação confortável.</li><li>Fluxo estável.</li><li>Nenhuma dor.</li><li>Pouco esforço.</li></ul></div></div>
        <button className="daily-start" type="button" onClick={startTraining}>▶ Iniciar treino</button>
      </div>
    </section>
  );
}

const css = `.daily-immersive{position:relative;min-height:100dvh;margin:0;padding:24px 18px 34px;color:#fff;overflow:hidden;background:radial-gradient(circle at 50% 45%,var(--daily-glow),transparent 24%),linear-gradient(180deg,#14191d,#0b0c10 58%,#050506)}.daily-immersive:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 24%,rgba(0,0,0,.72));pointer-events:none}.daily-immersive>*{position:relative;z-index:1}.daily-top-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 4px 16px;text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:900;color:#d6d6dc}.daily-top-line a{color:#fff;text-decoration:none;font-size:24px}.daily-top-line strong{border:1px solid var(--daily-accent);color:var(--daily-accent);border-radius:10px;padding:7px 10px}.daily-kicker{color:rgba(255,255,255,.7);font-weight:900;margin:0 0 8px;text-transform:uppercase;letter-spacing:.08em}.daily-screen-panel h1{font-size:clamp(38px,10vw,56px);letter-spacing:-.06em;line-height:.92;margin:0 0 4px}.daily-activity-name{font-size:22px;margin:0 0 12px;color:rgba(255,255,255,.82);font-weight:500}.daily-screen-panel{height:calc(100dvh - 92px);display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;justify-content:flex-start;overflow:auto;padding-bottom:18px}.video-placeholder{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:28px;min-height:138px;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));display:grid;place-items:center;padding:16px}.video-icon{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#121212;font-size:26px}.video-placeholder strong{font-size:20px}.video-placeholder span{color:#cfd0d8}.instruction-grid{display:grid;gap:10px;width:100%}.instruction-card{align-self:stretch;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:14px;background:rgba(255,255,255,.05)}.instruction-card h2{font-size:20px;margin:0}.instruction-card ul{margin:8px 0 0;padding-left:18px;color:#d2d2da;line-height:1.45}.instruction-card p{color:#d2d2da;line-height:1.45;margin:8px 0 0}.paper-card{width:100%;border-radius:18px;padding:20px 18px;background:linear-gradient(180deg,#fff,#ececec);color:#1b1b1b;text-align:center}.paper-card span,.paper-card small{display:block;color:#666}.paper-card strong{display:block;font-size:20px;margin-top:8px;text-transform:uppercase;color:#202020}.paper-card p{font-size:30px;margin:7px 0 8px;font-weight:950}.daily-start{width:min(100%,360px);border:0;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#15100a;text-transform:uppercase;font-weight:950;padding:17px 20px;text-align:center;margin-top:4px}.daily-training-screen{height:100dvh;max-height:100dvh;overflow:hidden;background:#050607;color:#fff;padding:0;margin:0}.finish-hidden,.finish-hidden-link{display:none}.breath-screen{min-height:100dvh;padding:9dvh 22px 34px;display:flex;flex-direction:column;align-items:center;background:linear-gradient(180deg,#171717,#060607);color:#fff;text-align:center;overflow:hidden}.breath-back{align-self:flex-start;color:#fff;text-decoration:none;font-size:32px}.breath-screen h1{font-family:Georgia,serif;font-size:22px;margin:24px 0 8dvh;color:rgba(255,255,255,.78)}.breath-time{font-family:Georgia,serif;font-size:clamp(30px,8vw,48px);line-height:1.15;margin-bottom:22px}.breath-ring{width:min(82vw,360px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(#fff var(--breath-progress),rgba(255,255,255,.24) 0);box-shadow:0 0 28px rgba(255,255,255,.12)}.breath-ring:before{content:'';position:absolute;inset:10px;border-radius:50%;background:#111}.breath-bars{position:relative;z-index:1;display:flex;flex-direction:column-reverse;gap:6px;transform:translateY(-18px)}.breath-bars i{width:54px;height:16px;background:rgba(255,255,255,.1);display:block}.breath-bars i.on{background:rgba(255,255,255,.76);box-shadow:0 0 14px rgba(255,255,255,.16)}.breath-bars b{height:2px;background:#d91414}.breath-ring span{position:absolute;z-index:1;bottom:19%;font-family:Georgia,serif;font-size:17px;color:rgba(255,255,255,.74);font-weight:700}.breath-screen p{font-size:20px;font-family:Georgia,serif;margin:34px 0 22px;color:rgba(255,255,255,.86)}.breath-screen button{border:0;background:transparent;color:#fff;padding:17px 20px;text-transform:none;font-family:Georgia,serif;font-weight:950;font-size:24px}.breath-result-actions{margin-top:34px;width:min(92vw,620px);display:flex;justify-content:space-between;gap:18px}.breath-result-actions button{width:auto;min-width:130px}@media(max-height:740px){.daily-screen-panel{height:calc(100dvh - 76px);gap:9px}.daily-screen-panel h1{font-size:38px}.video-placeholder{min-height:110px}.paper-card{padding:16px 14px}.instruction-card{padding:12px}.instruction-card p,.instruction-card ul{font-size:14px;line-height:1.35}.breath-screen{padding-top:6dvh}.breath-screen h1{margin-bottom:6dvh}.breath-time{font-size:32px}.breath-ring{width:min(72vw,310px)}}`;
