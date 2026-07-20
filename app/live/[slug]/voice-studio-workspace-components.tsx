'use client';

import VoiceStudioDawController from './voice-studio-daw-controller';
import { useVoiceStudioPlayhead } from './use-voice-studio-playhead';
import { useVoiceStudio } from './voice-studio-provider';
import {
  VoiceStudioSessionTransport,
  VoiceStudioTransportKeyboardOwner,
} from './voice-studio-session-transport';

/**
 * Declarative workspace regions.
 *
 * The legacy controller still owns editing, recording and the visual timeline.
 * Transport intent and the visual playhead clock are now owned by Session-backed
 * components, preparing an atomic Timeline replacement.
 */
export function Toolbar() {
  return <VoiceStudioTransportKeyboardOwner />;
}

export function Timeline() {
  const snapshot = useVoiceStudioPlayhead();
  return (
    <output
      hidden
      aria-hidden="true"
      data-voice-studio-playhead={snapshot.playhead}
      data-voice-studio-playhead-revision={snapshot.revision}
    />
  );
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
