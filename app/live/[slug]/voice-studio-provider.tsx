'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createVoiceStudioSession } from './voice-studio-session';
import type { VoiceStudioSession } from './voice-studio-session-types';

export type VoiceStudioProviderValue = {
  readOnly: boolean;
  session: VoiceStudioSession;
};

const VoiceStudioContext = createContext<VoiceStudioProviderValue | null>(null);

export function VoiceStudioProvider({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  const value = useMemo<VoiceStudioProviderValue>(() => ({
    readOnly,
    session: createVoiceStudioSession(),
  }), [readOnly]);

  return <VoiceStudioContext.Provider value={value}>{children}</VoiceStudioContext.Provider>;
}

export function useVoiceStudio(): VoiceStudioProviderValue {
  const context = useContext(VoiceStudioContext);
  if (!context) throw new Error('useVoiceStudio must be used inside VoiceStudioProvider.');
  return context;
}
