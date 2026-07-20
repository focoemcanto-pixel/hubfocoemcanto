'use client';

import { useRef } from 'react';
import {
  createVoiceStudioControllerAudioCaptureSlot,
  type VoiceStudioControllerAudioCaptureSlot,
} from './voice-studio-controller-audio-capture-slot';

export function useVoiceStudioControllerAudioCaptureSlot(): VoiceStudioControllerAudioCaptureSlot {
  const slotRef = useRef<VoiceStudioControllerAudioCaptureSlot | null>(null);
  slotRef.current ??= createVoiceStudioControllerAudioCaptureSlot();
  return slotRef.current;
}
