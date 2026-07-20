'use client';

import VoiceStudioDawController from './voice-studio-daw-controller';
import { useVoiceStudio } from './voice-studio-provider';
import { useVoiceStudioSessionTransport } from './use-voice-studio-transport';

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

/**
 * The visual transport remains rendered by the legacy controller for now.
 * This region already observes the official Session boundary so the next PR
 * can move the existing buttons without introducing a second audio runtime.
 */
export function BottomTransport() {
  useVoiceStudioSessionTransport();
  return null;
}
