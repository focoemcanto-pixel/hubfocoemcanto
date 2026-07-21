'use client';

import { useEffect } from 'react';

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
}

function studioRoot() {
  return document.querySelector<HTMLElement>('.vs-daw-runtime');
}

function recordButton(root: HTMLElement) {
  return root.querySelector<HTMLButtonElement>('.vs-main-controls button.record, .vs-main-controls button.recording');
}

function playPauseButton(root: HTMLElement) {
  const record = recordButton(root);
  const previous = record?.previousElementSibling;
  return previous instanceof HTMLButtonElement ? previous : null;
}

function cancelButton(root: HTMLElement) {
  return root.querySelector<HTMLButtonElement>('.vs-main-controls button[title="Cancelar gravação"]');
}

export default function VoiceStudioKeyboardTransportRuntime() {
  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isTypingTarget(event.target)) return;

      const root = studioRoot();
      if (!root || root.offsetParent === null) return;

      const record = recordButton(root);
      const countIn = Boolean(root.querySelector('.vs-countin'));
      const recording = Boolean(record?.classList.contains('recording'));

      let action: HTMLButtonElement | null = null;
      if (countIn) action = cancelButton(root);
      else if (recording) action = record;
      else action = playPauseButton(root);

      if (!action || action.disabled) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      action.click();
    };

    window.addEventListener('keydown', handleSpace, true);
    return () => window.removeEventListener('keydown', handleSpace, true);
  }, []);

  return null;
}
