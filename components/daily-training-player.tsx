'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { GuidedTrainingPlayer } from '@/components/guided-training-player';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

const accentMap = {
  gold: { icon: '♪', glow: 'rgba(245,199,107,.34)', color: '#f5c76b' },
  teal: { icon: '☁', glow: 'rgba(38,224,196,.32)', color: '#26e0c4' },
  purple: { icon: '♫', glow: 'rgba(155,76,255,.32)', color: '#a855f7' },
};

type DailyStyle = CSSProperties & { '--daily-glow': string; '--daily-accent': string };

export function DailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const [started, setStarted] = useState(false);
  const accent = accentMap[step.accent];
  const nextExercise = step.exerciseNumber < total ? step.exerciseNumber + 1 : null;
  const style = { '--daily-glow': accent.glow, '--daily-accent': accent.color } as DailyStyle;

  return (
    <section className="daily-immersive" style={style}>
      <style>{css}</style>
      <div className="daily-top-line">
        <Link href="/aluno/central" prefetch>←</Link>
        <span>Desafio diário</span>
        <strong>Dia {step.day}</strong>
      </div>

      {!started ? (
        <div className="daily-intro-panel">
          <p className="daily-kicker">Exercício {step.exerciseNumber} de {total}</p>
          <h1>Exercício #{step.exerciseNumber}</h1>
          <h2>{step.title}</h2>
          <p>{step.subtitle}</p>
          <div className="daily-note-orbit"><span>{accent.icon}</span></div>
          <div className="daily-objective"><strong>Objetivo</strong><p>{step.intro}</p></div>
          <div className="daily-meta"><span>⏱ {exercise.durationLabel}</span><span>▮ {exercise.level}</span></div>
          <button className="daily-start" type="button" onClick={() => setStarted(true)}>Iniciar treino</button>
          <Link className="daily-progress-link" href="/aluno/central/diarios/progresso" prefetch>Ver progresso do dia</Link>
          <div className="daily-bounce">⌄</div>
        </div>
      ) : (
        <div className="daily-player-panel">
          <p className="daily-kicker">Exercício {step.exerciseNumber} de {total}</p>
          <GuidedTrainingPlayer exercise={exercise} compact />
          <div className="daily-finish-actions">
            <Link className="daily-finish" href={`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`} prefetch>Concluir exercício</Link>
            {nextExercise ? <Link className="daily-next" href={`/aluno/central/diarios/${nextExercise}`} prefetch>Próximo exercício</Link> : <Link className="daily-next" href="/aluno/central/diarios/progresso" prefetch>Ver progresso</Link>}
          </div>
        </div>
      )}
    </section>
  );
}

const css = `.daily-immersive{position:relative;min-height:calc(100dvh - 86px);margin:-12px -10px 0;padding:24px 18px 34px;color:#fff;overflow:hidden;background:radial-gradient(circle at 50% 45%,var(--daily-glow),transparent 24%),linear-gradient(180deg,#14191d,#0b0c10 58%,#050506)}.daily-immersive:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 24%,rgba(0,0,0,.72)),radial-gradient(circle at 20% 72%,rgba(255,255,255,.11),transparent 18%);pointer-events:none}.daily-immersive>*{position:relative;z-index:1}.daily-top-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 4px 22px;text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:900;color:#d6d6dc}.daily-top-line a{color:#fff;text-decoration:none;font-size:24px}.daily-top-line strong{border:1px solid var(--daily-accent);color:var(--daily-accent);border-radius:10px;padding:7px 10px}.daily-intro-panel{min-height:calc(100dvh - 170px);display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:center}.daily-kicker{color:rgba(255,255,255,.7);font-weight:900;margin:0 0 12px}.daily-intro-panel h1{font-size:clamp(44px,13vw,62px);letter-spacing:-.06em;margin:0 0 10px}.daily-intro-panel h2{font-size:25px;margin:0 0 10px}.daily-intro-panel>p:not(.daily-kicker){max-width:310px;color:#d7d7de;line-height:1.45}.daily-note-orbit{width:156px;height:156px;border-radius:50%;display:grid;place-items:center;margin:28px auto;background:radial-gradient(circle, var(--daily-glow), transparent 62%);box-shadow:0 0 70px var(--daily-glow)}.daily-note-orbit span{font-size:86px;color:var(--daily-accent);filter:drop-shadow(0 0 24px var(--daily-accent))}.daily-objective{align-self:stretch;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:16px;background:rgba(255,255,255,.05);backdrop-filter:blur(14px)}.daily-objective strong{color:#fff}.daily-objective p{color:#d2d2da;margin:8px 0 0;line-height:1.45}.daily-meta{display:flex;justify-content:center;gap:18px;margin:20px 0;color:#fff;font-weight:900}.daily-start,.daily-finish{width:min(100%,360px);border:0;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#15100a;text-decoration:none;text-transform:uppercase;font-weight:950;padding:17px 20px;text-align:center;box-shadow:0 18px 55px rgba(233,179,72,.26)}.daily-progress-link{margin-top:18px;color:#f5c76b;font-weight:900}.daily-bounce{font-size:36px;margin-top:14px;animation:dailyBounce 1.8s ease-in-out infinite;color:#fff}.daily-player-panel{display:grid;gap:16px}.daily-player-panel .guided-player-card{background:transparent;border:0;box-shadow:none;padding:0}.daily-player-panel .guided-player-top h2{font-size:34px;text-align:center}.daily-player-panel .guided-player-top{display:grid;text-align:center}.daily-player-panel .guided-now{justify-self:center}.daily-finish-actions{display:grid;gap:12px;justify-items:center}.daily-next{color:#f5c76b;font-weight:900;text-decoration:none}@keyframes dailyBounce{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(10px);opacity:1}}@media(min-width:760px){.daily-immersive{border-radius:34px;margin:0;min-height:760px}.daily-intro-panel{min-height:660px}}`;
