'use client';

import { useCallback, useEffect, useState } from 'react';
import { useVoiceStudio } from './voice-studio-provider';
import { createLegacyRecordingCaptureAdapter } from './voice-studio-legacy-recording-capture-adapter';
import {
  observeVoiceStudioLegacyRecordingState,
  type VoiceStudioLegacyRecordingVisualState,
} from './voice-studio-legacy-recording-intent-bridge';

export function useVoiceStudioLegacyRecordingIntent() {
  const { session, readOnly } = useVoiceStudio();
  const [state, setState] = useState<VoiceStudioLegacyRecordingVisualState>('idle');
  const [captureState, setCaptureState] = useState(session.recordingCapture.getSnapshot());

  useEffect(() => session.recordingCapture.subscribe(() => {
    setCaptureState(session.recordingCapture.getSnapshot());
  }), [session]);

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

    if (captureState.state === 'capturing') {
      void session.recordingCapture.stop();
      return true;
    }

    if (captureState.state !== 'idle' && captureState.state !== 'failed') return false;

    const kind = session.project.tracks.find(track => track.armed)?.kind ?? 'audio';
    void session.recordingCapture.start(kind, createLegacyRecordingCaptureAdapter);
    return true;
  }, [captureState.state, readOnly, session]);

  return {
    state,
    captureState: captureState.state,
    captureError: captureState.error,
    isRecording: captureState.state === 'capturing' || state === 'recording',
    isCountIn: state === 'countin' || captureState.state === 'preparing',
    canTrigger: !readOnly && captureState.state !== 'preparing' && captureState.state !== 'stopping',
    trigger,
  };
}
