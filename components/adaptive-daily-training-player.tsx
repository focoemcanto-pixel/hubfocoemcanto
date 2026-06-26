'use client';

import { useMemo } from 'react';
import { DailyTrainingPlayer } from '@/components/daily-training-player';
import { BreathExperience } from '@/components/breath-experience';
import { personalizeDailyWarmup } from '@/lib/adaptive-training';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

export function AdaptiveDailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const personalizedExercise = useMemo(() => personalizeDailyWarmup(exercise), [exercise]);
  if (step.exerciseNumber === 2) return <BreathExperience step={step} />;
  return <DailyTrainingPlayer step={step} exercise={personalizedExercise} total={total} />;
}
