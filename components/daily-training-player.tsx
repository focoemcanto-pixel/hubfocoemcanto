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
type DailyStyle = CSSProperties & { '--daily-glow'?: string; '--daily-accent'?: string; '--breath-progress'?: string };
type DailyStage = 'instruction' | 'training';
type BreathState = 'idle' | 'running' | 'result';
type AudioCtor = typeof AudioContext;
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));

function BreathPractice({ step }: { step: DailyTrainingStep }) {
  const router = useRouter();
  const [state, setState] = useState<BreathState>('idle');
  const [heldSeconds, setHeldSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState('Prepare o ar e solte em S contínuo');
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const heldRef = useRef(0);
  const silentRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => () => stopAudio(), []);

  function stopAudio() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => null);
    ctxRef.current = null;
  }

  function finish() {
    stopAudio();
    completeDailyStep(step, Math.max(0, heldRef.current));
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  function showResult() {
    stopAudio();
    setState('result');
    setLevel(0);
  }

  async function start() {
    stopAudio();
    heldRef.current = 0;
    silentRef.current = 0;
    lastFrameRef.current = performance.now();
    setHeldSeconds(0);
    setLevel(0);
    setMessage('Ativando microfone...');
    setState('running');
    try {
      const Ctor = (window as AudioWindow).AudioContext || (window as AudioWindow).webkitAudioContext;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.14;
      source.connect(analyser);
      streamRef.current = stream;
      ctxRef.current = ctx;
      readBreath(analyser);
    } catch {
      setMessage('Permita o microfone para medir o S');
      setState('idle');
    }
  }

  function readBreath(analyser: AnalyserNode) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      const now = performance.now();
      const last = lastFrameRef.current ?? now;
      const delta = Math.min(0.08, Math.max(0, (now - last) / 1000));
      lastFrameRef.current = now;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      const startBin = Math.floor(data.length * 0.32);
      for (let i = startBin; i < data.length; i += 1) sum += data[i];
      const avg = sum / Math.max(1, data.length - startBin);
      const detected = clamp((avg - 6) / 58);
      const cleanLevel = detected < 0.06 ? 0 : detected;
      const isSustained = cleanLevel > 0.14;

      if (isSustained) {
        silentRef.current = 0;
        heldRef.current = Math.min(30, heldRef.current + delta);
        setMessage(cleanLevel > 0.74 ? 'Muito forte, deixe mais constante' : 'Continue sustentando');
      } else if (heldRef.current > 0) {
        silentRef.current += delta;
        setMessage('O S quebrou');
        if (silentRef.current > 0.45) return showResult();
      } else {
        setMessage('Comece o S para iniciar a contagem');
      }

      setLevel((old) => old * 0.58 + cleanLevel * 0.42);
      setHeldSeconds(heldRef.current);
      if (heldRef.current >= 30) return finish();
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  }

  const progress = (heldSeconds / 30) * 360;
  const bars = Array.from({ length: 9 }, (_, index) => index);
  const rounded = Math.max(0, Math.floor(heldSeconds));

  return (
    <section className="breath-screen">
      <style>{css}</style>
      <Link className="breath-back" href="/aluno/central/diarios">←</Link>
      <h1>Exercício de Respiração</h1>
      {state === 'result' ? <div className="breath-result"><strong>Sustentação: {rounded}s</strong><span>Meta: 30s</span></div> : <strong className="breath-time">{rounded} seg</strong>}
      <div className="breath-ring" style={{ '--breath-progress': `${progress}deg` } as DailyStyle}>
        <div className="breath-bars">{bars.map((bar) => <i key={bar} className={level * 9 > bar ? 'on' : ''} />)}<b /></div>
        <span>Nível de Respiração</span>
      </div>
      {state !== 'result' ? <p>{state === 'running' ? message : 'Prepare o ar e solte em S contínuo'}</p> : null}
      {state === 'result' ? <div className="breath-actions"><button className="secondary" type="button" onClick={finish}>Terminar</button><button type="button" onClick={start}>Tentar novamente</button></div> : <button type="button" onClick={state === 'running' ? showResult : start}>{state === 'running' ? 'Finalizar' : 'Iniciar'}</button>}
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
    return <section className="daily-training-screen"><style>{css}</style><GuidedTrainingPlayer exercise={exercise} compact autoStart /><button className="finish-hidden" type="button" onClick={finishTraining}>Concluir exercício</button>{nextExercise ? <Link className="finish-hidden-link" href={`/aluno/central/diarios/${nextExercise}`} prefetch>Próximo</Link> : null}</section>;
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
        {isBreathing ? <div className="paper-card compact-paper"><span>Exercício de apoio respiratório</span><strong>Sustentação em S</strong><p>30 seg</p><small>Solte o ar em S contínuo. O círculo só avança enquanto a sustentação permanecer estável.</small></div> : <div className="paper-card compact-paper"><span>Exercício personalizado para você</span><strong>Tessitura do treino</strong><p>E3 → G5</p><small>Gerado para percorrer sua região confortável, preparando sua voz sem esforço e respeitando seus limites atuais.</small></div>}
        <div className="instruction-grid"><div className="instruction-card"><h2>Como fazer</h2><p>{isBreathing ? 'Inspire com calma e solte o ar em S contínuo, sem empurrar e sem apertar o pescoço.' : 'Faça boca chiusa: som de “Mmm” com os lábios fechados, sentindo vibração leve no rosto e sem buscar volume.'}</p></div><div className="instruction-card"><h2>Durante o exercício</h2><ul><li>Mantenha pouco esforço.</li><li>Não aperte o pescoço.</li><li>Siga o guia visual.</li><li>Continue até o tempo finalizar.</li></ul></div><div className="instruction-card"><h2>Como saber se está certo</h2><ul><li>Sensação confortável.</li><li>Fluxo estável.</li><li>Nenhuma dor.</li><li>Pouco esforço.</li></ul></div></div>
        <button className="daily-start" type="button" onClick={startTraining}>▶ Iniciar treino</button>
      </div>
    </section>
  );
}

const css = `.daily-immersive{min-height:100dvh;margin:-24px -16px 0;padding:calc(34px + env(safe-area-inset-top)) 18px calc(34px + env(safe-area-inset-bottom));background:radial-gradient(circle at 50% 30%,var(--daily-glow),transparent 22%),linear-gradient(180deg,#171b20,#050607 58%,#020303);color:#fff}.daily-top-line{max-width:760px;margin:0 auto 20px;display:grid;grid-template-columns:60px 1fr 96px;align-items:center}.daily-top-line a{color:#fff;text-decoration:none;font-size:28px}.daily-top-line span{text-align:center;text-transform:uppercase;letter-spacing:.18em;font-weight:900;color:rgba(255,255,255,.75)}.daily-top-line strong{justify-self:end;border:1px solid var(--daily-accent);border-radius:14px;padding:9px 16px;color:var(--daily-accent);text-transform:uppercase;letter-spacing:.12em}.daily-screen-panel{max-width:760px;margin:0 auto}.instruction-panel{display:grid;gap:20px}.daily-kicker{margin:0;color:var(--daily-accent);text-transform:uppercase;letter-spacing:.20em;font-weight:900;text-align:center}.instruction-panel h1{margin:0;text-align:center;font-size:42px;color:#fff}.daily-activity-name{text-align:center;margin:-14px 0 0;color:rgba(255,255,255,.75);font-size:22px}.video-placeholder{height:210px;border:1px solid rgba(255,255,255,.14);border-radius:26px;background:linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.02));display:grid;place-items:center;text-align:center;color:rgba(255,255,255,.55)}.video-icon{width:78px;height:78px;border-radius:50%;background:radial-gradient(circle,var(--daily-glow),rgba(255,255,255,.06));display:grid;place-items:center;font-size:34px;color:#fff}.video-placeholder strong{display:block;color:#fff;font-size:20px}.paper-card,.instruction-card{border:1px solid rgba(255,255,255,.14);border-radius:26px;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.02));padding:24px 26px}.paper-card{text-align:center;background:#f8f8f8;color:#151515}.paper-card span{color:#777}.paper-card strong{display:block;font-size:46px;margin:8px 0}.paper-card p{font-size:20px;color:#555}.paper-card small{font-size:15px;color:#777}.instruction-grid{display:grid;gap:16px}.instruction-card h2{font-size:30px;margin:0 0 16px}.instruction-card p,.instruction-card li{font-size:20px;line-height:1.5;color:rgba(255,255,255,.76)}.daily-start{height:78px;border:0;border-radius:999px;background:linear-gradient(180deg,#ffdf83,#e8b94d);color:#080808;font-size:22px;font-weight:950;letter-spacing:.05em}.daily-training-screen{min-height:100dvh;margin:-24px -16px 0;background:#050607}.finish-hidden,.finish-hidden-link{position:fixed;right:12px;bottom:12px;z-index:80;opacity:0;pointer-events:none}.breath-screen{min-height:100dvh;margin:-24px -16px 0;padding:calc(42px + env(safe-area-inset-top)) 22px calc(36px + env(safe-area-inset-bottom));display:grid;place-items:center;text-align:center;color:#fff;background:radial-gradient(circle at 50% 32%,rgba(38,224,196,.25),transparent 28%),linear-gradient(180deg,#071014,#030405)}.breath-back{position:fixed;left:20px;top:calc(24px + env(safe-area-inset-top));color:#fff;text-decoration:none;font-size:32px}.breath-screen h1{font-size:34px}.breath-time{font-size:54px;color:#26e0c4}.breath-ring{width:min(78vw,360px);aspect-ratio:1;border-radius:50%;background:conic-gradient(#26e0c4 var(--breath-progress),rgba(255,255,255,.08) 0);display:grid;place-items:center;padding:12px;box-shadow:0 0 50px rgba(38,224,196,.18)}.breath-ring:before{content:'';grid-area:1/1;border-radius:50%;background:#071014}.breath-bars{grid-area:1/1;position:relative;z-index:2;display:flex;gap:8px;align-items:flex-end;height:92px}.breath-bars i{width:12px;height:28px;border-radius:999px;background:rgba(255,255,255,.16)}.breath-bars i.on{background:#26e0c4;box-shadow:0 0 18px rgba(38,224,196,.6)}.breath-bars i:nth-child(2n){height:48px}.breath-bars i:nth-child(3n){height:72px}.breath-ring span{grid-area:1/1;align-self:end;margin-bottom:54px;z-index:2;color:rgba(255,255,255,.7)}.breath-screen p{font-size:20px;color:rgba(255,255,255,.74)}.breath-screen button{height:60px;border:0;border-radius:999px;background:#26e0c4;color:#02110f;font-size:18px;font-weight:900;padding:0 30px}.breath-actions{display:flex;gap:12px}.breath-actions .secondary{background:rgba(255,255,255,.12);color:#fff}.breath-result{display:grid;gap:6px}.breath-result strong{font-size:34px;color:#26e0c4}.breath-result span{color:rgba(255,255,255,.62)}@media(max-width:640px){.daily-immersive{margin:-16px -12px 0;padding:calc(32px + env(safe-area-inset-top)) 16px calc(30px + env(safe-area-inset-bottom))}.instruction-panel h1{font-size:36px}.paper-card strong{font-size:38px}.instruction-card h2{font-size:26px}.instruction-card p,.instruction-card li{font-size:18px}.daily-start{height:70px}.daily-training-screen,.breath-screen{margin:-16px -12px 0}}`;
