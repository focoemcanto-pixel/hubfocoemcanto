'use client';

import { useSyncExternalStore } from 'react';
import { useVoiceStudio } from './voice-studio-provider';

export function useVoiceStudioPlayhead() {
  const { session } = useVoiceStudio();
  return useSyncExternalStore(
    session.playhead.subscribe,
    session.playhead.getSnapshot,
    session.playhead.getSnapshot,
  );
}
