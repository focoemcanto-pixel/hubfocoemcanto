'use client';

import { useEffect, useRef } from 'react';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples } from '@/lib/audio/piano-sample-engine';

const PIANO_NOTE_SELECTOR = '.ear6 .stage-four .keyboard > button';

export function EarPianoDragOnlyGuard() {
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    function getAudio() {
      if (!audioRef.current) audioRef.current = new AudioContext();
      return audioRef.current;
    }

    async function playPreview(note: string, button: HTMLButtonElement) {
      const ctx = getAudio();
      await ctx.resume().catch(() => null);
      const midi = noteNameToMidi(`${note}4`) ?? 60;
      void preloadPianoSamples(ctx, [midi]);
      button.classList.add('on');
      window.setTimeout(() => button.classList.remove('on'), 260);
      await playPianoSample(ctx, midi, ctx.currentTime + 0.02, ctx.currentTime + 0.58, 1.04);
    }

    function onClickCapture(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest(PIANO_NOTE_SELECTOR) : null;
      if (!(target instanceof HTMLButtonElement)) return;

      // In exercise 4, a normal tap/click must only preview the piano note.
      // Answering is reserved for press + drag/drop into the response circles.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const note = target.textContent?.trim();
      if (note) void playPreview(note, target);
    }

    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, []);

  return null;
}
