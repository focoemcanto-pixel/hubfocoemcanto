'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { dailyTrainingSteps } from '@/lib/training-center';
import { emptyDailyProgress, readDailyProgress, type DailyTrainingProgress } from '@/lib/daily-training-progress';

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function DailyTrainingProgressClient() {
  const [progress, setProgress] = useState<DailyTrainingProgress>(emptyDailyProgress());

  useEffect(() => setProgress(readDailyProgress()), []);

  const completedCount = progress.completedExercises.length;
  const percent = Math.round((completedCount / dailyTrainingSteps.length) * 100);
  const nextStep = useMemo(() => dailyTrainingSteps.find((step) => !progress.completedExercises.includes(step.exerciseNumber)), [progress.completedExercises]);
  const hasAny = completedCount > 0;

  return (
    <section className="progress-daily">
      <p className="eyebrow">Progresso do dia</p>
      <h1>Dia {dailyTrainingSteps[0]?.day || 1}</h1>
      <div className="progress-track">
        {dailyTrainingSteps.map((step, index) => (
          <span className="progress-piece" key={step.exerciseNumber}>
            <span className={`progress-dot ${progress.completedExercises.includes(step.exerciseNumber) ? 'done' : step.exerciseNumber === nextStep?.exerciseNumber ? 'current' : ''}`}>{progress.completedExercises.includes(step.exerciseNumber) ? '✓' : step.exerciseNumber}</span>
            {index < dailyTrainingSteps.length - 1 ? <span className="progress-line" /> : null}
          </span>
        ))}
      </div>
      <div className="summary-grid">
        <div className="summary-card"><strong>{progress.points}</strong><span>Pontos</span></div>
        <div className="summary-card"><strong>{formatSeconds(progress.totalSeconds)}</strong><span>Tempo total</span></div>
        <div className="summary-card"><strong>{percent}%</strong><span>Conclusão</span></div>
      </div>
      <div className="performance">
        <h2>Desempenho real</h2>
        {[
          ['Conclusão', percent],
          ['Consistência', hasAny ? 100 : 0],
          ['Treinos feitos', Math.round((completedCount / dailyTrainingSteps.length) * 100)],
          ['Tempo praticado', Math.min(100, Math.round((progress.totalSeconds / (dailyTrainingSteps.length * 180)) * 100))],
        ].map(([label, value]) => <div className="metric" key={String(label)}><span>{label}</span><div className="metric-bar"><span style={{ width: `${value}%` }} /></div><strong>{value}%</strong></div>)}
      </div>
      {nextStep ? <Link className="next-day" href={`/aluno/central/diarios/${nextStep.exerciseNumber}`} prefetch><div><small>Próximo treino</small><strong>{nextStep.title}</strong></div><span>›</span></Link> : <Link className="next-day" href="/aluno/central" prefetch><div><small>Dia concluído</small><strong>Voltar para Central</strong></div><span>›</span></Link>}
      {nextStep ? <Link className="gold-button" href={`/aluno/central/diarios/${nextStep.exerciseNumber}`} prefetch>Continuar treino</Link> : <Link className="gold-button" href="/aluno/central" prefetch>Voltar para Central</Link>}
      <Link className="back-link" href="/aluno/central" prefetch>Voltar para Central</Link>
    </section>
  );
}
