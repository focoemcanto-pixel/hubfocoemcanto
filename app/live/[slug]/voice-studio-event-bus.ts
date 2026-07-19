import type { VoiceStudioAsset, VoiceStudioProject, VoiceStudioTrack } from './voice-studio-project-model';
import type { VoiceStudioPlaybackEndReason, VoiceStudioPlaybackRequest } from './voice-studio-playback';

export type VoiceStudioEventMap = {
  PLAY_STARTED: { request: VoiceStudioPlaybackRequest };
  PLAY_STOPPED: { playhead: number; reason: VoiceStudioPlaybackEndReason };
  PLAYHEAD_CHANGED: { playhead: number };
  TRACK_UPDATED: { track: VoiceStudioTrack; project: VoiceStudioProject };
  PROJECT_CHANGED: { project: VoiceStudioProject; source: 'actions' | 'recording' | 'normalize' | 'undo' | 'redo' };
  ASSET_IMPORTED: { asset: VoiceStudioAsset; blob?: Blob };
  RECORD_STARTED: { sessionId: string; trackId: string; start: number };
  RECORD_STOPPED: { sessionId?: string; playhead: number; asset?: VoiceStudioAsset };
};

export type VoiceStudioEventName = keyof VoiceStudioEventMap;
export type VoiceStudioEventHandler<K extends VoiceStudioEventName> = (payload: VoiceStudioEventMap[K]) => void;

export class VoiceStudioEventBus {
  readonly #listeners = new Map<VoiceStudioEventName, Set<(payload: unknown) => void>>();

  publish<K extends VoiceStudioEventName>(event: K, payload: VoiceStudioEventMap[K]): void {
    this.#listeners.get(event)?.forEach(listener => listener(payload));
  }

  subscribe<K extends VoiceStudioEventName>(event: K, handler: VoiceStudioEventHandler<K>): () => void {
    const listeners = this.#listeners.get(event) ?? new Set<(payload: unknown) => void>();
    listeners.add(handler as (payload: unknown) => void);
    this.#listeners.set(event, listeners);
    return () => {
      listeners.delete(handler as (payload: unknown) => void);
      if (!listeners.size) this.#listeners.delete(event);
    };
  }

  clear(): void {
    this.#listeners.clear();
  }
}

export function createVoiceStudioEventBus(): VoiceStudioEventBus {
  return new VoiceStudioEventBus();
}
