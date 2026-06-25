'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { GuidedTrainingPlayer } from '@/components/guided-training-player';
import { completeDailyStep } from '@/lib/daily-training-progress';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

const accentMap = {
  gold: { icon: '♪', glow: 'rgba(245,199,107,.34)', color: '#f5c76b' },
  teal: { icon: '☁', glow: 'rgba(38,224,196,.32)', color: '#26e0c4' },
  purple: { icon: '♫', glow: 'rgba(155,76,255,.32)', color: '#a855f7' },
};

type DailyStyle = CSSProperties & { '--daily-glow': string; '--daily-accent': string };
type DailyStage = 'intro' | 'tutorial' | 'setup' | 'training';

export function DailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);
  const [stage, setStage] = useState<DailyStage>('intro');
  const accent = accentMap[step.accent];
  const nextExercise = step.exerciseNumber < total ? step.exerciseNumber + 1 : null;
  const style = { '--daily-glow': accent.glow, '--daily-accent': accent.color } as DailyStyle;

  function startTraining() { startedAtRef.current = Date.now(); setStage('training'); }
  function finishTraining() { const durationSeconds = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 1; completeDailyStep(step, durationSeconds); router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`); }

  if (stage === 'training') {
    return (
      <section className="daily-training-screen">
        <style>{css}</style>
        <header className="daily-training-head">
          <Link href="/aluno/central" prefetch>←</Link>
          <div><strong>Treino Guiado</strong><small>Exercício {step.exerciseNumber} de {total}</small></div>
          <span>DIA {step.day}</span>
        </header>
        <div className="daily-training-player-slot"><GuidedTrainingPlayer exercise={exercise} compact /></div>
        <button className="finish-hidden" type="button" onClick={finishTraining}>Concluir exercício</button>
        {nextExercise ? <Link className="finish-hidden-link" href={`/aluno/central/diarios/${nextExercise}`} prefetch>Próximo</Link> : null}
      </section>
    );
  }

  return (
    <section className="daily-immersive" style={style}>
      <style>{css}</style>
      <div className="daily-top-line"><Link href="/aluno/central" prefetch>←</Link><span>Daily Workout</span><strong>Dia {step.day}</strong></div>
      {stage === 'intro' ? <div className="daily-intro-panel"><p className="daily-kicker">Dia {step.day} • Exercício {step.exerciseNumber} de {total}</p><h1>Relaxando a Voz</h1><p className="daily-subtitle">Hoje vamos preparar sua voz para cantar com mais leveza e conforto.</p><div className="daily-note-orbit"><span>{accent.icon}</span></div><div className="daily-objective"><strong>O que vamos desenvolver</strong><ul><li>Soltar a voz sem fazer força.</li><li>Preparar a musculatura antes de cantar.</li><li>Perceber conforto antes de volume.</li></ul></div><div className="daily-meta"><span>⏱ {exercise.durationLabel}</span><span>Iniciante</span></div><button className="daily-start" type="button" onClick={() => setStage('tutorial')}>Começar</button><Link className="daily-progress-link" href="/aluno/central/diarios/progresso" prefetch>Ver progresso do dia</Link></div> : null}
      {stage === 'tutorial' ? <div className="daily-screen-panel"><p className="daily-kicker">Tutorial do exercício</p><h1>Antes de praticar</h1><div className="video-placeholder"><div className="video-icon">▶</div><strong>Vídeo do professor</strong><span>Pronto para receber seu tutorial em vídeo.</span></div><div className="instruction-grid"><div className="instruction-card"><h2>Como fazer</h2><p>Faça um som bem relaxado, como se sua voz estivesse acordando. Não tente cantar bonito. Apenas deixe a voz sair sem força.</p></div><div className="instruction-card"><h2>Durante o exercício</h2><ul><li>Use pouco volume.</li><li>Não aperte o pescoço.</li><li>Respire normalmente.</li><li>Se a voz falhar, continue relaxado.</li></ul></div><div className="instruction-card"><h2>Como saber se está certo</h2><ul><li>Sensação confortável.</li><li>Voz leve.</li><li>Nenhuma dor.</li><li>Pouco esforço.</li></ul></div></div><button className="daily-start" type="button" onClick={() => setStage('setup')}>Entendi, vamos praticar</button></div> : null}
      {stage === 'setup' ? <div className="daily-screen-panel setup-panel"><p className="daily-kicker">Treino personalizado</p><h1>Seu treino de hoje</h1><div className="paper-card"><span>Este exercício foi preparado para sua região vocal.</span><strong>Tenor</strong><p>E3 → G5</p><small>Hoje vamos trabalhar em uma região confortável para começar sem tensão.</small></div><div className="setup-details"><div><strong>Som usado</strong><span>Som relaxado</span></div><div><strong>Referência</strong><span>Piano + metrônomo</span></div><div><strong>Meta</strong><span>Conforto antes de volume</span></div></div><button className="daily-start" type="button" onClick={startTraining}>Começar exercício</button></div> : null}
    </section>
  );
}

const css = `.daily-immersive{position:relative;min-height:100dvh;margin:0;padding:24px 18px 34px;color:#fff;overflow:hidden;background:radial-gradient(circle at 50% 45%,var(--daily-glow),transparent 24%),linear-gradient(180deg,#14191d,#0b0c10 58%,#050506)}.daily-immersive:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 24%,rgba(0,0,0,.72)),radial-gradient(circle at 20% 72%,rgba(255,255,255,.11),transparent 18%);pointer-events:none}.daily-immersive>*{position:relative;z-index:1}.daily-top-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 4px 22px;text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:900;color:#d6d6dc}.daily-top-line a{color:#fff;text-decoration:none;font-size:24px}.daily-top-line strong{border:1px solid var(--daily-accent);color:var(--daily-accent);border-radius:10px;padding:7px 10px}.daily-intro-panel{min-height:calc(100dvh - 120px);display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:center}.daily-kicker{color:rgba(255,255,255,.7);font-weight:900;margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em}.daily-intro-panel h1,.daily-screen-panel h1{font-size:clamp(42px,12vw,62px);letter-spacing:-.06em;line-height:.92;margin:0 0 12px}.daily-subtitle{max-width:330px;color:#d7d7de;line-height:1.45}.daily-note-orbit{width:150px;height:150px;border-radius:50%;display:grid;place-items:center;margin:26px auto;background:radial-gradient(circle,var(--daily-glow),transparent 62%);box-shadow:0 0 70px var(--daily-glow)}.daily-note-orbit span{font-size:82px;color:var(--daily-accent);filter:drop-shadow(0 0 24px var(--daily-accent))}.daily-objective,.instruction-card{align-self:stretch;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:16px;background:rgba(255,255,255,.05);backdrop-filter:blur(14px)}.daily-objective ul,.instruction-card ul{margin:10px 0 0;padding-left:18px;color:#d2d2da;line-height:1.55}.instruction-card p{color:#d2d2da;line-height:1.55;margin:8px 0 0}.daily-meta{display:flex;justify-content:center;gap:18px;margin:20px 0;color:#fff;font-weight:900}.daily-start{width:min(100%,360px);border:0;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#15100a;text-transform:uppercase;font-weight:950;padding:17px 20px;text-align:center}.daily-progress-link{margin-top:18px;color:#f5c76b;font-weight:900}.daily-screen-panel{min-height:calc(100dvh - 120px);display:flex;flex-direction:column;gap:16px;align-items:center;text-align:center;justify-content:center}.video-placeholder{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:28px;min-height:210px;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));display:grid;place-items:center;padding:22px}.video-placeholder .video-icon{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#121212;font-size:34px}.video-placeholder strong{font-size:22px}.video-placeholder span{color:#cfd0d8}.instruction-grid{display:grid;gap:12px;width:100%}.paper-card{width:100%;position:relative;border-radius:8px;padding:28px 20px;background:linear-gradient(180deg,#fff,#ececec);color:#1b1b1b;text-align:center}.paper-card:before{content:'';position:absolute;top:-14px;left:50%;width:150px;height:28px;transform:translateX(-50%);background:rgba(224,195,133,.75)}.paper-card span,.paper-card small{display:block;color:#666}.paper-card strong{display:block;font-size:42px;margin-top:14px}.paper-card p{font-size:28px;margin:6px 0 14px;font-weight:950}.setup-details{width:100%;display:grid;gap:10px}.setup-details div{border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);padding:14px;text-align:left}.setup-details strong{display:block;color:#fff}.setup-details span{display:block;color:#cfd0d8;margin-top:4px}.daily-training-screen{height:100dvh;max-height:100dvh;overflow:hidden;background:linear-gradient(180deg,#171d22 0,#0a0f14 18%,#030507 100%);color:#fff;padding:8px 12px;display:grid;grid-template-rows:auto minmax(0,1fr);gap:6px}.daily-training-head{display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:8px;min-height:42px}.daily-training-head a{color:#fff;text-decoration:none;font-size:27px}.daily-training-head div{text-align:center;line-height:1}.daily-training-head strong{display:block;letter-spacing:.16em;text-transform:uppercase;font-size:clamp(12px,1.8dvh,17px);color:rgba(255,255,255,.75)}.daily-training-head small{display:block;margin-top:3px;color:rgba(255,255,255,.42);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.daily-training-head span{border:1.5px solid #ffd35d;color:#ffd35d;border-radius:13px;padding:7px 11px;font-weight:950;font-size:12px;letter-spacing:.07em}.daily-training-player-slot{min-height:0;height:100%;overflow:hidden;background:rgba(0,0,0,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.035)}.finish-hidden,.finish-hidden-link{display:none}`;
