'use client';

import { useEffect, useMemo, useState } from 'react';
import { dailyTrainingSteps } from '@/lib/training-center';
import { emptyDailyProgress, readDailyProgress, type DailyTrainingProgress } from '@/lib/daily-training-progress';

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function DailyTrainingLiveStats({ variant = 'summary' }: { variant?: 'summary' | 'track' }) {
  const [progress, setProgress] = useState<DailyTrainingProgress>(emptyDailyProgress());

  useEffect(() => {
    const refresh = () => setProgress(readDailyProgress());
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('daily-training-progress', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('daily-training-progress', refresh);
    };
  }, []);

  const completedCount = progress.completedExercises.length;
  const nextStep = useMemo(() => dailyTrainingSteps.find((step) => !progress.completedExercises.includes(step.exerciseNumber)) || dailyTrainingSteps[0], [progress.completedExercises]);

  if (variant === 'track') {
    return (
      <>
        <div className="daily-track">
          {dailyTrainingSteps.map((step, index) => (
            <span className="daily-track-piece" key={step.exerciseNumber}>
              <span className={`daily-dot ${progress.completedExercises.includes(step.exerciseNumber) ? 'done' : step.exerciseNumber === nextStep.exerciseNumber ? 'current' : ''}`}>{progress.completedExercises.includes(step.exerciseNumber) ? '✓' : step.exerciseNumber}</span>
              {index < dailyTrainingSteps.length - 1 ? <span className="daily-line" /> : null}
            </span>
          ))}
        </div>
        <a className="daily-current-card" href={`/aluno/central/diarios/${nextStep.exerciseNumber}`}>
          <div><small>{completedCount >= dailyTrainingSteps.length ? 'Desafio concluído' : 'Próximo exercício'}</small><h3>{nextStep.title}</h3><p>{nextStep.subtitle}</p></div><span>{completedCount >= dailyTrainingSteps.length ? 'Ver ›' : 'Iniciar ›'}</span>
        </a>
      </>
    );
  }

  return (
    <div className="today-progress">
      <div><strong>{completedCount ? `${completedCount}x` : '0'}</strong><span>Sequência</span></div>
      <div><strong>{completedCount}/{dailyTrainingSteps.length}</strong><span>Treinos</span></div>
      <div><strong>{progress.points}</strong><span>Pontos</span></div>
      <div><strong>{formatSeconds(progress.totalSeconds)}</strong><span>Tempo</span></div>
    </div>
  );
}
