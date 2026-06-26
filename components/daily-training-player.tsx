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
        {isBreathing ? <div className="paper-card compact-paper"><span>Exercício de apoio respiratório</span><strong>Sustentação em S</strong><p>30 seg</p><small>Solte o ar em S contínuo. O círculo só avança enquanto a sustentação permanecer estável.</small></div> : <div className="paper-card compact-paper"><span>Exercício personalizado para você</span><strong>Tessitura do treino</strong><p>E3 → G5</p><small>Gerado para percorrer sua região confortável, preparando sua voz sem esforço e respeitando seus limites atuais.</small></div>}
        <div className="instruction-grid"><div className="instruction-card"><h2>Como fazer</h2><p>{isBreathing ? 'Inspire com calma e solte o ar em S contínuo, sem empurrar e sem apertar o pescoço.' : 'Faça boca chiusa: som de “Mmm” com os lábios fechados, sentindo vibração leve no rosto e sem buscar volume.'}</p></div><div className="instruction-card"><h2>Durante o exercício</h2><ul><li>Mantenha pouco esforço.</li><li>Não aperte o pescoço.</li><li>Siga o guia visual.</li><li>Continue até o tempo finalizar.</li></ul></div><div className="instruction-card"><h2>Como saber se está certo</h2><ul><li>Sensação confortável.</li><li>Fluxo estável.</li><li>Nenhuma dor.</li><li>Pouco esforço.</li></ul></div></div>
        <button className="daily-start" type="button" onClick={startTraining}>▶ Iniciar treino</button>
      </div>
    </section>
  );
}

const css = `.daily-immersive{position:relative;min-height:100dvh;margin:0;padding:24px 18px 34px;color:#fff;overflow:hidden;background:radial-gradient(circle at 50% 45%,var(--daily-glow),transparent 24%),linear-gradient(180deg,#14191d,#0b0c10 58%,#050506)}.daily-immersive:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 24%,rgba(0,0,0,.72));pointer-events:none}.daily-immersive>*{position:relative;z-index:1}.daily-top-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 4px 16px;text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:900;color:#d6d6dc}.daily-top-line a{color:#fff;text-decoration:none;font-size:24px}.daily-top-line strong{border:1px solid var(--daily-accent);color:var(--daily-accent);border-radius:10px;padding:7px 10px}.daily-kicker{color:rgba(255,255,255,.7);font-weight:900;margin:0 0 8px;text-transform:uppercase;letter-spacing:.08em}.daily-screen-panel h1{font-size:clamp(38px,10vw,56px);letter-spacing:-.06em;line-height:.92;margin:0 0 4px}.daily-activity-name{font-size:22px;margin:0 0 12px;color:rgba(255,255,255,.82);font-weight:500}.daily-screen-panel{height:calc(100dvh - 92px);display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;justify-content:flex-start;overflow:auto;padding-bottom:18px}.video-placeholder{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:28px;min-height:138px;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));display:grid;place-items:center;padding:16px}.video-icon{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#121212;font-size:26px}.video-placeholder strong{font-size:20px}.video-placeholder span{color:#cfd0d8}.instruction-grid{display:grid;gap:10px;width:100%}.instruction-card{align-self:stretch;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:14px;background:rgba(255,255,255,.05)}.instruction-card h2{font-size:20px;margin:0}.instruction-card ul{margin:8px 0 0;padding-left:18px;color:#d2d2da;line-height:1.45}.instruction-card p{color:#d2d2da;line-height:1.45;margin:8px 0 0}.paper-card{width:100%;border-radius:18px;padding:20px 18px;background:linear-gradient(180deg,#fff,#ececec);color:#1b1b1b;text-align:center}.paper-card span,.paper-card small{display:block;color:#666}.paper-card strong{display:block;font-size:20px;margin-top:8px;text-transform:uppercase;color:#202020}.paper-card p{font-size:30px;margin:7px 0 8px;font-weight:950}.daily-start{width:min(100%,360px);border:0;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#15100a;text-transform:uppercase;font-weight:950;padding:17px 20px;text-align:center;margin-top:4px}.daily-training-screen{height:100dvh;max-height:100dvh;overflow:hidden;background:#050607;color:#fff;padding:0;margin:0}.finish-hidden,.finish-hidden-link{display:none}.breath-screen{min-height:100dvh;padding:9dvh 22px 34px;display:flex;flex-direction:column;align-items:center;background:linear-gradient(180deg,#171717,#060607);color:#fff;text-align:center;overflow:hidden}.breath-back{align-self:flex-start;color:#fff;text-decoration:none;font-size:32px}.breath-screen h1{font-family:Georgia,serif;font-size:20px;margin:24px 0 7dvh;color:rgba(255,255,255,.7)}.breath-time{font-family:Georgia,serif;font-size:44px;margin-bottom:22px}.breath-result{display:grid;gap:6px;margin:0 0 22px}.breath-result strong{font-family:Georgia,serif;font-size:34px;line-height:1.05;font-weight:750;color:#fff}.breath-result span{font-family:Georgia,serif;font-size:18px;color:rgba(255,255,255,.66)}.breath-ring{width:min(78vw,336px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(#fff var(--breath-progress),rgba(255,255,255,.22) 0);box-shadow:0 0 22px rgba(255,255,255,.09)}.breath-ring:before{content:'';position:absolute;inset:10px;border-radius:50%;background:#111}.breath-bars{position:relative;z-index:1;display:flex;flex-direction:column-reverse;gap:6px;transform:translateY(-18px)}.breath-bars i{width:54px;height:16px;background:rgba(255,255,255,.1);display:block}.breath-bars i.on{background:rgba(255,255,255,.76);box-shadow:0 0 14px rgba(255,255,255,.16)}.breath-bars b{height:2px;background:#d91414}.breath-ring span{position:absolute;z-index:1;bottom:18%;font-family:Georgia,serif;font-size:16px;color:rgba(255,255,255,.66);font-weight:600}.breath-screen p{font-size:18px;font-family:Georgia,serif;margin:30px 0 22px;color:rgba(255,255,255,.78)}.breath-screen button{width:min(360px,88vw);border:0;border-radius:999px;background:#fff;color:#111;padding:16px 20px;text-transform:uppercase;font-weight:900;font-size:17px}.breath-actions{width:min(420px,92vw);display:grid;grid-template-columns:1fr 1.2fr;gap:12px;margin-top:30px}.breath-actions button{width:100%;height:52px;padding:0;font-size:16px;text-transform:none}.breath-actions .secondary{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.25)}@media(max-height:740px){.daily-screen-panel{height:calc(100dvh - 76px);gap:9px}.daily-screen-panel h1{font-size:38px}.video-placeholder{min-height:110px}.paper-card{padding:16px 14px}.instruction-card{padding:12px}.instruction-card p,.instruction-card ul{font-size:14px;line-height:1.35}.breath-screen{padding-top:6dvh}.breath-screen h1{margin-bottom:5dvh}.breath-time{font-size:38px}.breath-result strong{font-size:28px}.breath-ring{width:min(70vw,300px)}.breath-actions{margin-top:20px}}`;
