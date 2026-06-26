'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { DailyTrainingStep } from '@/lib/training-center';
import { completeDailyStep, emptyDailyProgress, type DailyTrainingProgress } from '@/lib/daily-training-progress';

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

const summaryIcons = ['♫', '🎙', '🥁', '🎹', '♮', '🎧'];

export function DailyTrainingCompletion({ step, total, next, durationSeconds }: { step: DailyTrainingStep; total: number; next?: DailyTrainingStep; durationSeconds: number }) {
  const [progress, setProgress] = useState<DailyTrainingProgress>(emptyDailyProgress());

  useEffect(() => {
    const nextProgress = completeDailyStep(step, durationSeconds);
    setProgress(nextProgress);
    window.dispatchEvent(new Event('daily-training-progress'));
  }, [durationSeconds, step]);

  const completedCount = progress.completedExercises.length;
  const marks = useMemo(() => summaryIcons.map((_, index) => (index === 2 ? 'wrong' : 'right')), []);

  return (
    <div className="done-premium-card">
      <div className="done-premium-medal"><span>♛</span><b>◇</b></div>

      <section className="done-premium-level">
        <h2>NÍVEL - {step.level}</h2>
        <div className="done-premium-icons" aria-label="Resumo das respostas">
          {summaryIcons.map((icon, index) => (
            <span key={`${icon}-${index}`} className={marks[index] === 'wrong' ? 'wrong' : 'right'}>
              <i>{icon}</i>
              <b>{marks[index] === 'wrong' ? '×' : '✓'}</b>
            </span>
          ))}
        </div>
      </section>

      <div className="done-premium-divider"><i /></div>

      <section className="done-premium-quote">
        <strong>“</strong>
        <p>Acredite que você pode<br />e você já está<br /><em>no meio do caminho.</em></p>
        <small>— Marcos Cruz</small>
      </section>

      <div className="done-premium-stats">
        <span><b>{completedCount}/{total}</b><small>conclusão</small></span>
        <span><b>{progress.points}</b><small>pontos</small></span>
        <span><b>{formatSeconds(progress.totalSeconds)}</b><small>tempo</small></span>
      </div>

      {next ? (
        <Link className="done-premium-button" href={`/aluno/central/diarios/${next.exerciseNumber}`} prefetch>
          <span>◇</span><b>Continuar</b><i>›</i>
        </Link>
      ) : (
        <Link className="done-premium-button" href="/aluno/central/diarios/progresso" prefetch>
          <span>◇</span><b>Ver progresso</b><i>›</i>
        </Link>
      )}
    </div>
  );
}
