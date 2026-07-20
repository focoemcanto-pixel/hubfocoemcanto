'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useVoiceStudio } from './voice-studio-provider';
import type {
  VoiceStudioTransportController,
  VoiceStudioTransportSnapshot,
} from './voice-studio-transport-controller';
import type { VoiceStudioTransportCommands } from './voice-studio-transport-commands';
import {
  createVoiceStudioTransportViewModel,
  type VoiceStudioTransportViewModel,
} from './voice-studio-transport-view-model';

export type VoiceStudioTransportBinding = {
  snapshot: VoiceStudioTransportSnapshot;
  viewModel: VoiceStudioTransportViewModel;
  commands: VoiceStudioTransportCommands;
};

/** Keeps the original isolated-controller API for tests and non-Provider consumers. */
export function useVoiceStudioTransport(
  transport: VoiceStudioTransportController,
): VoiceStudioTransportSnapshot {
  return useSyncExternalStore(
    transport.subscribe,
    transport.getSnapshot,
    transport.getSnapshot,
  );
}

/**
 * Official UI boundary for the Provider-owned Session.
 * Components observe Transport state here and send intent only through
 * TransportCommands; Playback, Recording, Runtime and EventBus stay hidden.
 */
export function useVoiceStudioSessionTransport(): VoiceStudioTransportBinding {
  const { session } = useVoiceStudio();
  const snapshot = useVoiceStudioTransport(session.transport);
  const viewModel = useMemo(
    () => createVoiceStudioTransportViewModel(snapshot),
    [snapshot],
  );

  return { snapshot, viewModel, commands: session.transportCommands };
}
