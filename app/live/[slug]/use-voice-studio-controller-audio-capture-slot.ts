'use client';

import { useMemo, useRef, type RefObject } from 'react';
import type { VoiceStudioAudioCapture } from './voice-studio-recording-engine';

export type VoiceStudioControllerAudioCaptureSlot = {
  readonly captureRef: RefObject<VoiceStudioAudioCapture | null>;
  readonly recorderRef: RefObject<MediaRecorder | null>;
  readonly chunksRef: RefObject<Blob[]>;
  readonly streamRef: RefObject<MediaStream | null>;
  readonly analyserRef: RefObject<AnalyserNode | null>;
  readonly inputSourceRef: RefObject<MediaStreamAudioSourceNode | null>;
  readonly monitorGainRef: RefObject<GainNode | null>;
  readonly rafRef: RefObject<number | null>;
  readonly livePeaksRef: RefObject<number[]>;
};

export function useVoiceStudioControllerAudioCaptureSlot(): VoiceStudioControllerAudioCaptureSlot {
  const captureRef = useRef<VoiceStudioAudioCapture | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const livePeaksRef = useRef<number[]>([]);

  return useMemo(() => ({
    captureRef,
    recorderRef,
    chunksRef,
    streamRef,
    analyserRef,
    inputSourceRef,
    monitorGainRef,
    rafRef,
    livePeaksRef,
  }), []);
}
