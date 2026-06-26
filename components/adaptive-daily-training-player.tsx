'use client';

import { useMemo } from 'react';
import { DailyEarTrainingFlowV14 } from './daily-ear-training-flow-v14';
import { DailyPitchTrainingFlow } from './daily-pitch-training-flow';
import { DailyTrainingPlayer } from '@/components/daily-training-player';
import { personalizeDailyWarmup } from '@/lib/adaptive-training';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

export function AdaptiveDailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const personalizedExercise = useMemo(() => personalizeDailyWarmup(exercise), [exercise]);
  if (exercise.categorySlug === 'percepcao') return <DailyEarTrainingFlowV14 step={step} exercise={personalizedExercise} />;
  if (exercise.slug === 'sustentacao-centro-da-nota-01') return <DailyPitchTrainingFlow step={step} exercise={personalizedExercise} />;
  return <DailyTrainingPlayer step={step} exercise={personalizedExercise} total={total} />;
}
