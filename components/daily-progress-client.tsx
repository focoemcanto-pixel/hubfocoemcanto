'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { readDailyProgress, type DailyTrainingProgress } from '@/lib/daily-training-progress';
import { dailyTrainingSteps } from '@/lib/training-center';

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

export function DailyProgressClient() {
  const [progress, setProgress] = useState<DailyTrainingProgress>({ completedExercises: [], points: 0, totalSeconds: 0, completedAtByExercise: {} });

  useEffect(() => {
    setProgress(readDailyProgress());
  }, []);

  const completedCount = progress.completedExercises.length;
  const total = dailyTrainingSteps.length;
  const conclusion = Math.round((completedCount / Math.max(1, total)) * 100);
  const nextStep = dailyTrainingSteps.find((step) => !progress.completedExercises.includes(step.exerciseNumber));
  const metrics = useMemo(() => {
    const timeTarget = total * 180;
    return [
      ['Conclusão', conclusion],
      ['Treinos feitos', Math.round((completedCount / Math.max(1, total)) * 100)],
      ['Tempo praticado', Math.min(100, Math.round((progress.totalSeconds / Math.max(1, timeTarget)) * 100))],
      ['Pontuação', Math.min(100, Math.round((progress.points / Math.max(1, dailyTrainingSteps.reduce((sum, step) => sum + step.points, 0))) * 100))],
    ] as const;
  }, [completedCount, conclusion, progress.points, progress.totalSeconds, total]);

  return (
    <section className="progress-daily">
      <style>{css}</style>
      <p className="eyebrow">Progresso do dia</p>
      <h1>Dia {dailyTrainingSteps[0]?.day || 1}</h1>
      <div className="progress-track">
        {dailyTrainingSteps.map((step) => (
          <Fragment key={step.exerciseNumber}>
            <div className={`progress-dot ${progress.completedExercises.includes(step.exerciseNumber) ? 'done' : step.exerciseNumber === nextStep?.exerciseNumber ? 'current' : ''}`}>{progress.completedExercises.includes(step.exerciseNumber) ? '✓' : step.exerciseNumber}</div>
            {step.exerciseNumber < dailyTrainingSteps.length ? <div className="progress-line" /> : null}
          </Fragment>
        ))}
      </div>
      <div className="summary-grid">
        <div className="summary-card"><strong>{progress.points}</strong><span>Pontos</span></div>
        <div className="summary-card"><strong>{formatDuration(progress.totalSeconds)}</strong><span>Tempo total</span></div>
        <div className="summary-card"><strong>{completedCount}/{total}</strong><span>Concluídos</span></div>
      </div>
      <div className="performance">
        <h2>Desempenho real</h2>
        {metrics.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><div className="metric-bar"><span style={{ width: `${value}%` }} /></div><strong>{value}%</strong></div>)}
      </div>
      {nextStep ? <Link className="next-day" href={`/aluno/central/diarios/${nextStep.exerciseNumber}`} prefetch><div><small>Próximo treino</small><strong>{nextStep.title}</strong></div><span>›</span></Link> : <Link className="next-day" href="/aluno/central" prefetch><div><small>Dia concluído</small><strong>Voltar para Central</strong></div><span>›</span></Link>}
      {nextStep ? <Link className="gold-button" href={`/aluno/central/diarios/${nextStep.exerciseNumber}`} prefetch>Continuar treino</Link> : null}
      <Link className="back-link" href="/aluno/central" prefetch>Voltar para Central</Link>
    </section>
  );
}

const css = `.progress-daily{min-height:100dvh;padding:34px 22px;background:radial-gradient(circle at 50% 35%,rgba(38,224,196,.16),transparent 28%),linear-gradient(180deg,#17191c,#090a0c);color:#fff}.progress-daily h1{font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:.96;margin:10px 0 24px}.progress-track{display:flex;align-items:center;gap:8px;margin-bottom:28px}.progress-dot{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;border:2px solid rgba(255,255,255,.16);font-weight:950;color:#8f929a}.progress-dot.done{border-color:#26e0c4;color:#26e0c4}.progress-dot.current{border-color:#f5c76b;color:#f5c76b}.progress-line{height:2px;flex:1;background:rgba(255,255,255,.18)}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}.summary-card{border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);padding:14px}.summary-card strong{display:block;font-size:24px;color:#f5c76b}.summary-card span{color:#bfc0ca;font-size:11px;font-weight:900}.performance{border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(255,255,255,.04);padding:18px;margin-top:18px}.performance h2{font-size:22px;margin:0 0 16px}.metric{display:grid;grid-template-columns:104px 1fr 42px;align-items:center;gap:10px;margin:14px 0;color:#d8d8df;font-weight:900}.metric-bar{height:8px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}.metric-bar span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#26e0c4,#f5c76b)}.next-day{display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:#fff;border:1px solid rgba(245,199,107,.28);border-radius:22px;padding:16px;background:linear-gradient(90deg,rgba(245,199,107,.12),rgba(255,255,255,.04));margin:24px 0}.next-day small{display:block;color:#f5c76b;font-weight:900}.gold-button{display:block;text-align:center;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#14100a;text-decoration:none;text-transform:uppercase;font-weight:950;padding:17px 20px}.back-link{display:block;text-align:center;color:#f5c76b;margin-top:18px;font-weight:900}`;
