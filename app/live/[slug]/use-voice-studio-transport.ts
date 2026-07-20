'use client';

import { useSyncExternalStore } from 'react';
import { useVoiceStudio } from './voice-studio-provider';
import type {
  VoiceStudioTransportController,
  VoiceStudioTransportSnapshot,
} from './voice-studio-transport-controller';
import type { VoiceStudioTransportCommands } from './voice-studio-transport-commands';

export type VoiceStudioTransportBinding = {
  snapshot: VoiceStudioTransportSnapshot;
  commands: VoiceStudioTransportCommands;
};

/**
 * Observes the Session-owned Transport without allowing UI components to
 * import Playback, Recording, Runtime or EventBus.
 *
 * The optional controller keeps compatibility with isolated tests and legacy
 * consumers while the workspace migrates to the Provider-owned Session.
 */
export function useVoiceStudioTransport(
  controller?: VoiceStudioTransportController,
): VoiceStudioTransportSnapshot {
  const { session } = useVoiceStudio();
  const transport = controller ?? session.transport;

  return useSyncExternalStore(
    transport.subscribe,
    transport.getSnapshot,
    transport.getSnapshot,
  );
}

export function useVoiceStudioTransportBinding(): VoiceStudioTransportBinding {
  const { session } = useVoiceStudio();
  const snapshot = useSyncExternalStore(
    session.transport.subscribe,
    session.transport.getSnapshot,
    session.transport.getSnapshot,
  );

  return { snapshot, commands: session.transportCommands };
}
