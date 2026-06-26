'use client';

import { useMemo } from 'react';
import { DailyEarTrainingFlowV12 } from '@/components/daily-ear-training-flow-v12';
import { DailyTrainingPlayer } from '@/components/daily-training-player';
import { personalizeDailyWarmup } from '@/lib/adaptive-training';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

export function AdaptiveDailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const personalizedExercise = useMemo(() => personalizeDailyWarmup(exercise), [exercise]);
  if (exercise.categorySlug === 'percepcao') return <DailyEarTrainingFlowV12 step={step} exercise={personalizedExercise} />;
  return <DailyTrainingPlayer step={step} exercise={personalizedExercise} total={total} />;
}
