import type { VoiceStudioEventBus } from './voice-studio-event-bus';

export type VoiceStudioPlayheadSnapshot = {
  playhead: number;
  revision: number;
};

export class VoiceStudioPlayheadStore {
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: Array<() => void>;
  #snapshot: VoiceStudioPlayheadSnapshot;

  constructor(eventBus: VoiceStudioEventBus, initialPlayhead = 0) {
    this.#snapshot = { playhead: Math.max(0, initialPlayhead), revision: 0 };
    this.#unsubscribe = [
      eventBus.subscribe('PLAYHEAD_CHANGED', ({ playhead }) => this.set(playhead)),
      eventBus.subscribe('PLAY_STOPPED', ({ playhead }) => this.set(playhead)),
      eventBus.subscribe('RECORD_STOPPED', ({ playhead }) => this.set(playhead)),
      eventBus.subscribe('PROJECT_CHANGED', ({ project }) => this.set(project.view.playhead)),
    ];
  }

  getSnapshot = (): VoiceStudioPlayheadSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  set(playhead: number): void {
    const next = Math.max(0, Number.isFinite(playhead) ? playhead : 0);
    if (Math.abs(next - this.#snapshot.playhead) < 0.0001) return;
    this.#snapshot = { playhead: next, revision: this.#snapshot.revision + 1 };
    this.#listeners.forEach(listener => listener());
  }

  dispose(): void {
    this.#unsubscribe.forEach(unsubscribe => unsubscribe());
    this.#listeners.clear();
  }
}

export function createVoiceStudioPlayheadStore(eventBus: VoiceStudioEventBus, initialPlayhead = 0) {
  return new VoiceStudioPlayheadStore(eventBus, initialPlayhead);
}
