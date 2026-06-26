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

const activityNames = ['Aquecimento', 'Respiração', 'Afinação', 'Percepção'];

type DailyStyle = CSSProperties & { '--daily-glow': string; '--daily-accent': string };
type DailyStage = 'instruction' | 'training';

export function DailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);
  const [stage, setStage] = useState<DailyStage>('instruction');
  const accent = accentMap[step.accent];
  const nextExercise = step.exerciseNumber < total ? step.exerciseNumber + 1 : null;
  const activityName = activityNames[step.exerciseNumber - 1] || 'Treino';
  const style = { '--daily-glow': accent.glow, '--daily-accent': accent.color } as DailyStyle;

  function startTraining() {
    startedAtRef.current = Date.now();
    setStage('training');
  }

  function finishTraining() {
    const durationSeconds = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 1;
    completeDailyStep(step, durationSeconds);
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  if (stage === 'training') {
    return (
      <section className="daily-training-screen">
        <style>{css}</style>
        <GuidedTrainingPlayer exercise={exercise} compact />
        <button className="finish-hidden" type="button" onClick={finishTraining}>Concluir exercício</button>
        {nextExercise ? <Link className="finish-hidden-link" href={`/aluno/central/diarios/${nextExercise}`} prefetch>Próximo</Link> : null}
      </section>
    );
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
        <div className="paper-card compact-paper"><span>Exercício personalizado para você</span><strong>Tessitura do treino</strong><p>E3 → G5</p><small>Gerado para percorrer sua região confortável, preparando sua voz sem esforço e respeitando seus limites atuais.</small><div className="range-line"><i /><b /></div><div className="training-tags"><em>5 graus</em><em>Cromático</em><em>{exercise.bpm} BPM</em></div></div>
        <div className="instruction-grid"><div className="instruction-card"><h2>Como fazer</h2><p>Faça boca chiusa: som de “Mmm” com os lábios fechados, sentindo vibração leve no rosto e sem buscar volume.</p></div><div className="instruction-card"><h2>Durante o exercício</h2><ul><li>Cante com pouco volume.</li><li>Não aperte o pescoço.</li><li>Siga as faixas da timeline.</li><li>Deixe o piano preparar cada novo tom.</li></ul></div><div className="instruction-card"><h2>Como saber se está certo</h2><ul><li>Sensação confortável.</li><li>Som leve e estável.</li><li>Bolinha passando próxima da faixa.</li><li>Nenhuma dor ou aperto.</li></ul></div></div>
        <button className="daily-start" type="button" onClick={startTraining}>▶ Iniciar treino</button>
      </div>
    </section>
  );
}

const css = `.daily-immersive{position:relative;min-height:100dvh;margin:0;padding:24px 18px 34px;color:#fff;overflow:hidden;background:radial-gradient(circle at 50% 45%,var(--daily-glow),transparent 24%),linear-gradient(180deg,#14191d,#0b0c10 58%,#050506)}.daily-immersive:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 24%,rgba(0,0,0,.72)),radial-gradient(circle at 20% 72%,rgba(255,255,255,.11),transparent 18%);pointer-events:none}.daily-immersive>*{position:relative;z-index:1}.daily-top-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 4px 16px;text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:900;color:#d6d6dc}.daily-top-line a{color:#fff;text-decoration:none;font-size:24px}.daily-top-line strong{border:1px solid var(--daily-accent);color:var(--daily-accent);border-radius:10px;padding:7px 10px}.daily-kicker{color:rgba(255,255,255,.7);font-weight:900;margin:0 0 8px;text-transform:uppercase;letter-spacing:.08em}.daily-screen-panel h1{font-size:clamp(38px,10vw,56px);letter-spacing:-.06em;line-height:.92;margin:0 0 4px}.daily-activity-name{font-size:22px;margin:0 0 12px;color:rgba(255,255,255,.82);font-weight:500}.daily-screen-panel{height:calc(100dvh - 92px);display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;justify-content:flex-start;overflow:auto;padding-bottom:18px}.video-placeholder{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:28px;min-height:156px;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));display:grid;place-items:center;padding:18px}.video-placeholder .video-icon{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#121212;font-size:28px}.video-placeholder strong{font-size:20px}.video-placeholder span{color:#cfd0d8}.instruction-grid{display:grid;gap:10px;width:100%}.instruction-card{align-self:stretch;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:14px;background:rgba(255,255,255,.05);backdrop-filter:blur(14px)}.instruction-card h2{font-size:20px;margin:0}.instruction-card ul{margin:8px 0 0;padding-left:18px;color:#d2d2da;line-height:1.45}.instruction-card p{color:#d2d2da;line-height:1.45;margin:8px 0 0}.paper-card{width:100%;position:relative;border-radius:18px;padding:22px 18px;background:linear-gradient(180deg,#fff,#ececec);color:#1b1b1b;text-align:center;box-shadow:0 18px 44px rgba(0,0,0,.22)}.paper-card:before{content:'';position:absolute;top:-10px;left:50%;width:128px;height:20px;transform:translateX(-50%);background:rgba(224,195,133,.75)}.paper-card span,.paper-card small{display:block;color:#666}.paper-card strong{display:block;font-size:20px;margin-top:8px;text-transform:uppercase;letter-spacing:.04em;color:#202020}.paper-card p{font-size:34px;margin:7px 0 8px;font-weight:950;letter-spacing:-.04em}.range-line{position:relative;height:10px;margin:14px auto 12px;width:min(250px,72%);border-radius:999px;background:rgba(0,0,0,.13)}.range-line i,.range-line b{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:var(--daily-accent);transform:translateY(-50%);box-shadow:0 0 18px var(--daily-glow)}.range-line i{left:0}.range-line b{right:0}.training-tags{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px}.training-tags em{font-style:normal;border-radius:999px;background:rgba(0,0,0,.08);padding:6px 10px;color:#3a3a3a;font-size:12px;font-weight:900}.daily-start{width:min(100%,360px);border:0;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#15100a;text-transform:uppercase;font-weight:950;padding:17px 20px;text-align:center;margin-top:4px}.daily-training-screen{height:100dvh;max-height:100dvh;overflow:hidden;background:#050607;color:#fff;padding:0;margin:0}.finish-hidden,.finish-hidden-link{display:none}@media(max-height:740px){.daily-screen-panel{height:calc(100dvh - 76px);gap:9px}.daily-screen-panel h1{font-size:38px}.daily-activity-name{font-size:18px;margin-bottom:6px}.video-placeholder{min-height:118px;padding:14px}.video-placeholder .video-icon{width:50px;height:50px;font-size:22px}.paper-card{padding:18px 14px}.paper-card strong{font-size:17px}.paper-card p{font-size:28px}.paper-card small{font-size:13px}.instruction-card{padding:12px}.instruction-card h2{font-size:18px}.instruction-card p,.instruction-card ul{font-size:14px;line-height:1.35}.daily-start{padding:14px 18px}}`;