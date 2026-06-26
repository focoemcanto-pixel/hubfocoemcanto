'use client';

import { useRef } from 'react';
import { DailyEarTrainingFlowV13 } from './daily-ear-training-flow-v13';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

export function DailyEarTrainingFlowV14(props: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const relaying = useRef(false);

  function relayDropToSlot(event: React.PointerEvent<HTMLDivElement>) {
    if (relaying.current) return;

    const root = event.currentTarget.querySelector<HTMLElement>('.ear13');
    const ghost = root?.querySelector<HTMLElement>('.drag-ghost');
    const slots = Array.from(root?.querySelectorAll<HTMLElement>('[data-slot]') ?? []);

    if (!root || !ghost || slots.length === 0) return;

    const pointX = event.clientX;
    const pointY = event.clientY;

    let bestSlot: HTMLElement | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(pointX - centerX, pointY - centerY);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestSlot = slot;
      }
    }

    if (!bestSlot || bestDistance > 92) return;

    const rect = bestSlot.getBoundingClientRect();
    const fixedX = rect.left + rect.width / 2;
    const fixedY = rect.top + rect.height / 2;

    relaying.current = true;
    root.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: fixedX,
        clientY: fixedY,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
      }),
    );

    window.setTimeout(() => {
      relaying.current = false;
    }, 0);
  }

  return (
    <div onPointerUpCapture={relayDropToSlot} onPointerCancelCapture={relayDropToSlot}>
      <DailyEarTrainingFlowV13 {...props} />
    </div>
  );
}
