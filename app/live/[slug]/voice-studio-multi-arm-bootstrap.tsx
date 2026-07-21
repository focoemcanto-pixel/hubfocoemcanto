'use client';

import { useEffect } from 'react';

const REQUEST_EVENT = 'foco-voice-studio-request-snapshot';

export default function VoiceStudioMultiArmBootstrap() {
  useEffect(() => {
    const requestSnapshot = () => window.dispatchEvent(new Event(REQUEST_EVENT));
    const timers = [0, 80, 250, 700, 1500].map(delay => window.setTimeout(requestSnapshot, delay));

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.vs-daw-runtime .vs-track-heads button[title="Armar track"]')) {
        requestSnapshot();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      window.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, []);

  return null;
}
