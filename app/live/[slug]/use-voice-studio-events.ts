'use client';

import { useEffect } from 'react';
import type {
  VoiceStudioEventHandler,
  VoiceStudioEventMap,
  VoiceStudioEventName,
  VoiceStudioEventBus,
} from './voice-studio-event-bus';

export type VoiceStudioEventSubscriptions = Partial<{
  [K in VoiceStudioEventName]: VoiceStudioEventHandler<K>;
}>;

/**
 * React integration boundary for Voice Studio events.
 * Components subscribe to events and never receive module callbacks.
 */
export function useVoiceStudioEvents(
  eventBus: VoiceStudioEventBus,
  subscriptions: VoiceStudioEventSubscriptions,
): void {
  useEffect(() => {
    const unsubscribe = (Object.keys(subscriptions) as VoiceStudioEventName[]).flatMap(event => {
      const handler = subscriptions[event];
      if (!handler) return [];
      return [eventBus.subscribe(event, handler as VoiceStudioEventHandler<typeof event>)];
    });
    return () => unsubscribe.forEach(release => release());
  }, [eventBus, subscriptions]);
}

export type { VoiceStudioEventMap };
