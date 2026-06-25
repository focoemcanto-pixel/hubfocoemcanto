import type { DailyTrainingStep } from '@/lib/training-center';

export type DailyTrainingProgress = {
  completedExercises: number[];
  points: number;
  totalSeconds: number;
  completedAtByExercise: Record<string, string>;
  updatedAt?: string;
};

export const DAILY_TRAINING_PROGRESS_KEY = 'hub:focoemcanto:daily-training-progress:v1';

export function emptyDailyProgress(): DailyTrainingProgress {
  return { completedExercises: [], points: 0, totalSeconds: 0, completedAtByExercise: {} };
}

export function readDailyProgress(): DailyTrainingProgress {
  if (typeof window === 'undefined') return emptyDailyProgress();
  try {
    const raw = window.localStorage.getItem(DAILY_TRAINING_PROGRESS_KEY);
    if (!raw) return emptyDailyProgress();
    const parsed = JSON.parse(raw) as Partial<DailyTrainingProgress>;
    return {
      completedExercises: Array.isArray(parsed.completedExercises) ? parsed.completedExercises : [],
      points: Number(parsed.points || 0),
      totalSeconds: Number(parsed.totalSeconds || 0),
      completedAtByExercise: parsed.completedAtByExercise || {},
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return emptyDailyProgress();
  }
}

export function writeDailyProgress(progress: DailyTrainingProgress) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DAILY_TRAINING_PROGRESS_KEY, JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }));
}

export function completeDailyStep(step: DailyTrainingStep, durationSeconds: number) {
  const progress = readDailyProgress();
  const alreadyCompleted = progress.completedExercises.includes(step.exerciseNumber);
  const nextProgress: DailyTrainingProgress = {
    completedExercises: alreadyCompleted ? progress.completedExercises : [...progress.completedExercises, step.exerciseNumber].sort((a, b) => a - b),
    points: alreadyCompleted ? progress.points : progress.points + step.points,
    totalSeconds: progress.totalSeconds + Math.max(1, Math.round(durationSeconds)),
    completedAtByExercise: { ...progress.completedAtByExercise, [step.exerciseNumber]: new Date().toISOString() },
  };
  writeDailyProgress(nextProgress);
  return nextProgress;
}
