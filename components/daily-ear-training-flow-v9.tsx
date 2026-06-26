'use client';

import { DailyEarTrainingFlowV7 } from '@/components/daily-ear-training-flow-v7';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

export function DailyEarTrainingFlowV9({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  return (
    <>
      <style>{noSelectStyles}</style>
      <DailyEarTrainingFlowV7 step={step} exercise={exercise} />
    </>
  );
}

const noSelectStyles = `
  .ear7,
  .ear7 *,
  .stage-four,
  .stage-four *,
  .keyboard,
  .keyboard *,
  .slots,
  .slots * {
    -webkit-user-select: none !important;
    user-select: none !important;
    -webkit-touch-callout: none !important;
  }

  .stage-four,
  .stage-four .keyboard,
  .stage-four .keyboard button,
  .stage-four .keyboard span,
  .stage-four .slots,
  .stage-four .slots button {
    touch-action: none !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  .stage-four .keyboard button,
  .stage-four .slots button {
    cursor: grab;
  }

  .stage-four .keyboard button:active,
  .stage-four .slots button:active {
    cursor: grabbing;
  }
`;
