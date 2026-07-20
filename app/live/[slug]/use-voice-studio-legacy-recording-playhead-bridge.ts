'use client';

import { useEffect } from 'react';
import { useVoiceStudio } from './voice-studio-provider';

export type LegacyRecordingVisualStatus = 'idle' | 'countin' | 'recording' | 'playing';

/**
 * Temporary migration bridge for the recording clock that is still owned by
 * VoiceStudioDawController. It publishes only visual playhead intent into the
 * Session EventBus; capture, MediaRecorder and commit remain legacy-owned.
 */
export function useVoiceStudioLegacyRecordingPlayheadBridge(
  status: LegacyRecordingVisualStatus,
  recordStart: number,
): void {
  const { session } = useVoiceStudio();

  useEffect(() => {
    if (status !== 'recording') {
      if (status === 'countin') {
        session.eventBus.publish('PLAYHEAD_CHANGED', { playhead: Math.max(0, recordStart) });
      }
      return;
    }

    const startedAt = performance.now();
    const start = Math.max(0, recordStart);
    let frame: number | null = null;
    let lastPublishedAt = 0;

    const tick = (now: number) => {
      // About 30 visual updates per second is enough for a smooth playhead and
      // avoids flooding React while the waveform preview is also updating.
      if (now - lastPublishedAt >= 32) {
        session.eventBus.publish('PLAYHEAD_CHANGED', {
          playhead: start + Math.max(0, (now - startedAt) / 1000),
        });
        lastPublishedAt = now;
      }
      frame = requestAnimationFrame(tick);
    };

    session.eventBus.publish('PLAYHEAD_CHANGED', { playhead: start });
    frame = requestAnimationFrame(tick);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [recordStart, session, status]);
}
