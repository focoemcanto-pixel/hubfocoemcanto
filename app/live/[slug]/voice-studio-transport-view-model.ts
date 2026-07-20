import type { VoiceStudioTransportSnapshot } from './voice-studio-transport-controller';

export type VoiceStudioTransportViewModel = {
  state: VoiceStudioTransportSnapshot['state'];
  playhead: number;
  isIdle: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isRecording: boolean;
  isCountIn: boolean;
  isStopping: boolean;
  isSeeking: boolean;
  canPlay: boolean;
  canPause: boolean;
  canStop: boolean;
  canRecord: boolean;
  canReturnToStart: boolean;
};

export function createVoiceStudioTransportViewModel(
  snapshot: VoiceStudioTransportSnapshot,
): VoiceStudioTransportViewModel {
  const { state, playhead } = snapshot;
  const isIdle = state === 'IDLE';
  const isPlaying = state === 'PLAYING';
  const isPaused = state === 'PAUSED';
  const isRecording = state === 'RECORDING';
  const isCountIn = state === 'COUNT_IN';
  const isStopping = state === 'STOPPING';
  const isSeeking = state === 'SEEKING';

  return {
    state,
    playhead,
    isIdle,
    isPlaying,
    isPaused,
    isRecording,
    isCountIn,
    isStopping,
    isSeeking,
    canPlay: isIdle || isPaused,
    canPause: isPlaying,
    canStop: !isIdle,
    canRecord: isIdle,
    canReturnToStart: playhead > 0 || !isIdle,
  };
}
