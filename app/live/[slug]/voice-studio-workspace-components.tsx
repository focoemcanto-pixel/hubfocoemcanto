'use client';

import VoiceStudioDawController from './voice-studio-daw-controller';
import { useVoiceStudio } from './voice-studio-provider';

/**
 * Declarative workspace regions.
 *
 * The legacy controller remains mounted inside TrackArea during the migration
 * so the current DAW keeps its behavior while state and handlers are moved
 * incrementally into Session-backed components.
 */
export function Toolbar() {
  return null;
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
  return null;
}
