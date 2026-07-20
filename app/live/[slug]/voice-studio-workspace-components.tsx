'use client';

import VoiceStudioDawController from './voice-studio-daw-controller';
import { useVoiceStudio } from './voice-studio-provider';
import {
  VoiceStudioSessionTransport,
  VoiceStudioTransportKeyboardOwner,
} from './voice-studio-session-transport';

/**
 * Declarative workspace regions.
 *
 * The legacy controller still owns editing, recording and the visual timeline.
 * Transport intent is now owned by Session-backed components.
 */
export function Toolbar() {
  return <VoiceStudioTransportKeyboardOwner />;
}

export function Timeline() {
  return null;
}

export function TrackArea() {
  const { readOnly } = useVoiceStudio();
  return <VoiceStudioDawController readOnly={readOnly} />;
}

export function Mixer() {
  return null;
}

export function Inspector() {
  return null;
}

export function BottomTransport() {
  return <VoiceStudioSessionTransport />;
}
