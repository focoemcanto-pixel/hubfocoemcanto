'use client';

import { useState } from 'react';
import { createVoiceStudioSession } from './voice-studio-session';
import type { CreateVoiceStudioSessionOptions, VoiceStudioSession } from './voice-studio-session-types';

export function useVoiceStudioSession(options: CreateVoiceStudioSessionOptions): VoiceStudioSession {
  const [session] = useState(() => createVoiceStudioSession(options));
  return session;
}
