'use client';

import { useEffect, useRef } from 'react';
import { DailyEarTrainingFlowV7 } from '@/components/daily-ear-training-flow-v7';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

export function DailyEarTrainingFlowV9({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let ghost: HTMLDivElement | null = null;
    let suppressClickUntil = 0;

    function getContext() {
      audioRef.current ??= new AudioContext();
      return audioRef.current;
    }

    async function instantPreview(note: string) {
      const context = getContext();
      await context.resume().catch(() => null);
      const midi = noteNameToMidi(`${note}4`) ?? 60;
      void preloadPianoSamples(context, [midi]);
      await playPianoSample(context, midi, context.currentTime + 0.005, context.currentTime + 0.38, 1.08);
    }

    function moveGhost(event: PointerEvent) {
      if (!ghost) return;
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
    }

    function clearGhost() {
      ghost?.remove();
      ghost = null;
      document.querySelectorAll('.stage-four .keyboard button.is-touching').forEach((node) => node.classList.remove('is-touching'));
      document.removeEventListener('pointermove', moveGhost, true);
      document.removeEventListener('pointerup', clearGhost, true);
      document.removeEventListener('pointercancel', clearGhost, true);
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      const key = target?.closest('.stage-four .keyboard button') as HTMLButtonElement | null;
      if (!key) return;

      const note = key.textContent?.trim();
      if (!note) return;

      suppressClickUntil = Date.now() + 650;
      key.classList.add('is-touching');
      void instantPreview(note);

      ghost?.remove();
      ghost = document.createElement('div');
      ghost.className = 'piano-drag-ghost';
      ghost.textContent = note;
      document.body.appendChild(ghost);
      moveGhost(event);

      document.addEventListener('pointermove', moveGhost, true);
      document.addEventListener('pointerup', clearGhost, true);
      document.addEventListener('pointercancel', clearGhost, true);
    }

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const key = target?.closest('.stage-four .keyboard button');
      if (!key || Date.now() > suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onClick, true);
      clearGhost();
    };
  }, []);

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
  .stage-four .keyboard button.is-touching,
  .stage-four .slots button:active {
    cursor: grabbing;
  }

  .stage-four .keyboard button.is-touching {
    transform: translateY(3px) scale(.985);
    filter: brightness(.94) drop-shadow(0 0 18px rgba(255, 212, 130, .48));
  }

  .piano-drag-ghost {
    position: fixed;
    z-index: 999999;
    width: 58px;
    height: 58px;
    margin-left: -29px;
    margin-top: -29px;
    border-radius: 999px;
    border: 2px solid #ffd482;
    background: radial-gradient(circle, rgba(255, 212, 130, .28), rgba(16, 14, 12, .92) 62%);
    color: #ffd482;
    display: grid;
    place-items: center;
    font: 900 22px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    box-shadow: 0 0 22px rgba(255, 212, 130, .42), inset 0 0 18px rgba(255, 212, 130, .16);
    pointer-events: none;
    transform: translate3d(0,0,0);
    will-change: left, top;
  }
`;
