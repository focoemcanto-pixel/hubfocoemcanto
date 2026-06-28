'use client';

import { useEffect, useMemo, useState } from 'react';
import { dailyTrainingSteps } from '@/lib/training-center';
import { emptyDailyProgress, readDailyProgress, type DailyTrainingProgress } from '@/lib/daily-training-progress';

type Summary = { correct?: number; wrong?: number; total?: number; avgCents?: number | null; durationSeconds?: number; savedAt?: number };

function formatSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function dateKey(value?: string | number | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function readSummary(key: string): Summary | null {
  try {
    const raw = window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Summary;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function readAccuracy() {
  const summaries = ['daily-pitch-note-summary', 'daily-melodic-control-summary']
    .map(readSummary)
    .filter(Boolean) as Summary[];
  const total = summaries.reduce((sum, item) => sum + Math.max(0, Number(item.total || 0)), 0);
  const correct = summaries.reduce((sum, item) => sum + Math.max(0, Number(item.correct || 0)), 0);
  if (total > 0) return Math.round((correct / total) * 100);
  return null;
}

function achievementsFrom(progress: DailyTrainingProgress, accuracy: number | null, activeDays: number) {
  let count = 0;
  if (progress.completedExercises.length > 0) count += 1;
  if (progress.completedExercises.length >= dailyTrainingSteps.length) count += 1;
  if (activeDays >= 2) count += 1;
  if (progress.points >= 100) count += 1;
  if (accuracy != null && accuracy >= 80) count += 1;
  return count;
}

function useRealTrainingStats() {
  const [progress, setProgress] = useState<DailyTrainingProgress>(emptyDailyProgress());
  const [accuracy, setAccuracy] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      setProgress(readDailyProgress());
      setAccuracy(readAccuracy());
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('daily-training-progress', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('daily-training-progress', refresh);
    };
  }, []);

  const activeDays = useMemo(() => {
    const days = new Set(Object.values(progress.completedAtByExercise || {}).map(dateKey).filter(Boolean));
    if (progress.updatedAt) {
      const updated = dateKey(progress.updatedAt);
      if (updated && progress.completedExercises.length) days.add(updated);
    }
    return days.size;
  }, [progress.completedAtByExercise, progress.completedExercises.length, progress.updatedAt]);

  const completedCount = progress.completedExercises.length;
  const total = dailyTrainingSteps.length;
  const achievements = achievementsFrom(progress, accuracy, activeDays);
  const track = dailyTrainingSteps.map((step) => progress.completedExercises.includes(step.exerciseNumber));
  return { progress, accuracy, activeDays, completedCount, total, achievements, track };
}

export function TrainingCenterDailyMetric() {
  const { activeDays, completedCount, total, track } = useRealTrainingStats();
  return (
    <div className="path-metric daily-real-metric">
      <span>🔥</span>
      <strong>{activeDays}</strong>
      <span>{activeDays === 1 ? 'dia acessado' : 'dias acessados'}</span>
      <div className="mini-track" aria-label={`${completedCount} de ${total} treinos concluídos`}>
        {track.map((done, index) => <i className={done ? 'done' : ''} key={index} />)}
      </div>
    </div>
  );
}

export function TrainingCenterProgressCard() {
  const { progress, accuracy, activeDays, completedCount, total, achievements } = useRealTrainingStats();
  return (
    <section className="progress-card">
      <div className="progress-head"><h2>Seu progresso geral</h2><a className="report-button" href="/aluno/central/diarios/progresso">▥ Ver relatório</a></div>
      <div className="stats-grid">
        <div className="stat-item"><div className="stat-icon">◎</div><strong className="stat-value green">{completedCount}</strong><span className="stat-label">Exercícios<br />concluídos</span></div>
        <div className="stat-item"><div className="stat-icon">🔥</div><strong className="stat-value orange">{activeDays}</strong><span className="stat-label">Dias<br />acessados</span></div>
        <div className="stat-item"><div className="stat-icon">〰</div><strong className="stat-value blue">{accuracy == null ? '—' : `${accuracy}%`}</strong><span className="stat-label">Precisão<br />média</span></div>
        <div className="stat-item"><div className="stat-icon">🏆</div><strong className="stat-value gold">{achievements}</strong><span className="stat-label">Conquistas<br />alcançadas</span></div>
      </div>
      <div className="progress-foot"><span>{completedCount}/{total} hoje</span><span>{progress.points} pontos</span><span>{formatSeconds(progress.totalSeconds)} de treino</span></div>
    </section>
  );
}
