'use client';

import { useCallback, useEffect, useState } from 'react';
import { useVoiceStudio } from './voice-studio-provider';
import {
  observeVoiceStudioLegacyRecordingState,
  triggerVoiceStudioLegacyRecordingIntent,
  type VoiceStudioLegacyRecordingVisualState,
} from './voice-studio-legacy-recording-intent-bridge';

export function useVoiceStudioLegacyRecordingIntent() {
  const { session, readOnly } = useVoiceStudio();
  const [state, setState] = useState<VoiceStudioLegacyRecordingVisualState>('idle');

  useEffect(() => observeVoiceStudioLegacyRecordingState(next => {
    setState(next);
    const transportState = session.transport.state;

    if (next === 'countin' && transportState === 'IDLE') {
      session.transport.beginCountIn();
      return;
    }

    if (next === 'recording' && transportState !== 'RECORDING') {
      session.transport.beginRecording();
      return;
    }

    if (next === 'idle' && (transportState === 'COUNT_IN' || transportState === 'RECORDING')) {
      session.transport.endRecording(session.playhead.getSnapshot().playhead);
    }
  }), [session]);

  const trigger = useCallback(() => {
    if (readOnly) return false;
    return triggerVoiceStudioLegacyRecordingIntent();
  }, [readOnly]);

  return {
    state,
    isRecording: state === 'recording',
    isCountIn: state === 'countin',
    canTrigger: !readOnly && state !== 'countin',
    trigger,
  };
}
