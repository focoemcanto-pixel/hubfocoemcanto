'use client';

import { useEffect } from 'react';

export type VoiceStudioKeyboardShortcutActions = {
  playPause: () => void;
  startRecording: () => void | Promise<void>;
  stopRecording: () => void;
  splitSelection: () => void;
  deleteSelection: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  duplicateSelection: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  moveSelectionFocus: (direction: -1 | 1, extend: boolean) => void;
  undo: () => void;
  redo: () => void;
};

export type UseVoiceStudioKeyboardShortcutsOptions = {
  enabled: boolean;
  recording: boolean;
  countIn: boolean;
  hasSelection: boolean;
  actions: VoiceStudioKeyboardShortcutActions;
};

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
}

export function useVoiceStudioKeyboardShortcuts({
  enabled,
  recording,
  countIn,
  hasSelection,
  actions,
}: UseVoiceStudioKeyboardShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const keydown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (event.code === 'Space') {
        event.preventDefault();
        if (!recording && !countIn) actions.playPause();
        return;
      }

      if (key === 'r' && !mod) {
        event.preventDefault();
        if (recording) actions.stopRecording();
        else void actions.startRecording();
        return;
      }

      if (key === 's' && !mod) {
        event.preventDefault();
        actions.splitSelection();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
        event.preventDefault();
        actions.deleteSelection();
        return;
      }

      if (mod && key === 'c') {
        event.preventDefault();
        actions.copySelection();
        return;
      }

      if (mod && key === 'v') {
        event.preventDefault();
        actions.pasteSelection();
        return;
      }

      if (mod && key === 'd') {
        event.preventDefault();
        actions.duplicateSelection();
        return;
      }

      if (mod && key === 'a') {
        event.preventDefault();
        actions.selectAll();
        return;
      }

      if (mod && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        actions.undo();
        return;
      }

      if ((mod && key === 'y') || (mod && event.shiftKey && key === 'z')) {
        event.preventDefault();
        actions.redo();
        return;
      }

      if (event.key === 'Escape') {
        actions.clearSelection();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        actions.moveSelectionFocus(1, event.shiftKey);
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        actions.moveSelectionFocus(-1, event.shiftKey);
      }
    };

    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [actions, countIn, enabled, hasSelection, recording]);
}
