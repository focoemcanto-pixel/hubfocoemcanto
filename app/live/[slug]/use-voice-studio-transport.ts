'use client';

import { useSyncExternalStore } from 'react';
import type {
  VoiceStudioTransportController,
  VoiceStudioTransportSnapshot,
} from './voice-studio-transport-controller';

export function useVoiceStudioTransport(
  transport: VoiceStudioTransportController,
): VoiceStudioTransportSnapshot {
  return useSyncExternalStore(
    transport.subscribe,
    transport.getSnapshot,
    transport.getSnapshot,
  );
}
