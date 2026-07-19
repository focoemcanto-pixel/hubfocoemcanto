'use client';

import { VoiceStudioProvider } from './voice-studio-provider';
import {
  BottomTransport,
  Inspector,
  Mixer,
  Timeline,
  Toolbar,
  TrackArea,
} from './voice-studio-workspace-components';

export default function VoiceStudioDaw({ readOnly }: { readOnly: boolean }) {
  return (
    <VoiceStudioProvider readOnly={readOnly}>
      <Toolbar />
      <Timeline />
      <TrackArea />
      <Mixer />
      <Inspector />
      <BottomTransport />
    </VoiceStudioProvider>
  );
}
