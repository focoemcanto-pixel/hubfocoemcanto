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
export type VoiceStudioEventHandler<K extends VoiceStudioEventName> = (payload: VoiceStudioEventMap[K]) => void | Promise<void>;
type UntypedHandler = (payload: unknown) => void | Promise<void>;

export class VoiceStudioEventBus {
  readonly #listeners = new Map<VoiceStudioEventName, Set<UntypedHandler>>();

  publish<K extends VoiceStudioEventName>(event: K, payload: VoiceStudioEventMap[K]): void {
    this.#listeners.get(event)?.forEach(listener => { void listener(payload); });
  }

  async publishAsync<K extends VoiceStudioEventName>(event: K, payload: VoiceStudioEventMap[K]): Promise<void> {
    const listeners = [...(this.#listeners.get(event) ?? [])];
    await Promise.all(listeners.map(listener => listener(payload)));
  }

  subscribe<K extends VoiceStudioEventName>(event: K, handler: VoiceStudioEventHandler<K>): () => void {
    const listeners = this.#listeners.get(event) ?? new Set<UntypedHandler>();
    listeners.add(handler as UntypedHandler);
    this.#listeners.set(event, listeners);
    return () => {
      listeners.delete(handler as UntypedHandler);
      if (!listeners.size) this.#listeners.delete(event);
    };
  }

  clear(): void { this.#listeners.clear(); }
}

export function createVoiceStudioEventBus(): VoiceStudioEventBus {
  return new VoiceStudioEventBus();
}
