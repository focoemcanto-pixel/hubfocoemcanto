'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { DailyTrainingStep } from '@/lib/training-center';
import { completeDailyStep, emptyDailyProgress, readDailyProgress, type DailyTrainingProgress } from '@/lib/daily-training-progress';

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function DailyTrainingCompletion({ step, total, next }: { step: DailyTrainingStep; total: number; next?: DailyTrainingStep }) {
  const [progress, setProgress] = useState<DailyTrainingProgress>(emptyDailyProgress());

  useEffect(() => {
    const nextProgress = completeDailyStep(step, 180);
    setProgress(nextProgress);
    window.dispatchEvent(new Event('daily-training-progress'));
  }, [step]);

  const completedCount = progress.completedExercises.length;
  const alreadyCompleted = useMemo(() => readDailyProgress().completedExercises.includes(step.exerciseNumber), [step.exerciseNumber]);

  return (
    <div className="done-card">
      <div className="done-check">✓</div>
      <h1>Excelente!</h1>
      <p>Você concluiu o Exercício #{step.exerciseNumber} do desafio diário.</p>
      <div className="done-stats">
        <div className="done-stat"><strong>{alreadyCompleted ? progress.points : `+${step.points}`}</strong><span>{alreadyCompleted ? 'Pontos totais' : 'Pontos'}</span></div>
        <div className="done-stat"><strong>{completedCount}/{total}</strong><span>Conclusão</span></div>
        <div className="done-stat"><strong>{formatSeconds(progress.totalSeconds)}</strong><span>Tempo</span></div>
      </div>
      {next ? <Link className="done-next" href={`/aluno/central/diarios/${next.exerciseNumber}`} prefetch><div><small>Próximo exercício</small><strong>{next.title}</strong></div><span>›</span></Link> : <Link className="done-next" href="/aluno/central/diarios/progresso" prefetch><div><small>Desafio concluído</small><strong>Ver progresso do dia</strong></div><span>›</span></Link>}
      {next ? <Link className="done-button" href={`/aluno/central/diarios/${next.exerciseNumber}`} prefetch>Continuar</Link> : <Link className="done-button" href="/aluno/central/diarios/progresso" prefetch>Ver progresso</Link>}
      <Link className="done-link" href="/aluno/central" prefetch>Voltar para Central</Link>
    </div>
  );
}
