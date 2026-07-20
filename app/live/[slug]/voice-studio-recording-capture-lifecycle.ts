export type VoiceStudioCaptureKind = 'audio' | 'midi';
export type VoiceStudioCaptureState = 'idle' | 'preparing' | 'capturing' | 'stopping' | 'failed';

export type VoiceStudioCaptureSnapshot = {
  state: VoiceStudioCaptureState;
  kind: VoiceStudioCaptureKind | null;
  startedAt: number | null;
  error: string | null;
};

export type VoiceStudioCaptureHandle = {
  stop(): Promise<void> | void;
  cancel(): Promise<void> | void;
  dispose?(): Promise<void> | void;
};

export type VoiceStudioCaptureStarter = () => Promise<VoiceStudioCaptureHandle>;
type Listener = () => void;

const INITIAL_SNAPSHOT: VoiceStudioCaptureSnapshot = {
  state: 'idle',
  kind: null,
  startedAt: null,
  error: null,
};

export class VoiceStudioRecordingCaptureLifecycle {
  readonly #listeners = new Set<Listener>();
  #snapshot: VoiceStudioCaptureSnapshot = INITIAL_SNAPSHOT;
  #handle: VoiceStudioCaptureHandle | null = null;
  #generation = 0;

  getSnapshot = (): VoiceStudioCaptureSnapshot => this.#snapshot;
  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async start(kind: VoiceStudioCaptureKind, starter: VoiceStudioCaptureStarter): Promise<boolean> {
    if (this.#snapshot.state !== 'idle' && this.#snapshot.state !== 'failed') return false;
    const generation = ++this.#generation;
    this.#patch({ state: 'preparing', kind, startedAt: null, error: null });

    try {
      const handle = await starter();
      if (generation !== this.#generation) {
        await handle.dispose?.();
        return false;
      }
      this.#handle = handle;
      this.#patch({ state: 'capturing', kind, startedAt: performance.now(), error: null });
      return true;
    } catch (error) {
      if (generation === this.#generation) {
        this.#handle = null;
        this.#patch({
          state: 'failed',
          kind,
          startedAt: null,
          error: error instanceof Error ? error.message : 'Não foi possível iniciar a captura.',
        });
      }
      return false;
    }
  }

  async stop(): Promise<void> {
    if (this.#snapshot.state !== 'capturing' || !this.#handle) return;
    const handle = this.#handle;
    this.#patch({ ...this.#snapshot, state: 'stopping' });
    try {
      await handle.stop();
    } finally {
      await handle.dispose?.();
      this.#reset();
    }
  }

  async cancel(): Promise<void> {
    ++this.#generation;
    const handle = this.#handle;
    this.#handle = null;
    try {
      await handle?.cancel();
    } finally {
      await handle?.dispose?.();
      this.#reset();
    }
  }

  async dispose(): Promise<void> {
    await this.cancel();
    this.#listeners.clear();
  }

  #reset(): void {
    this.#handle = null;
    this.#patch({ ...INITIAL_SNAPSHOT });
  }

  #patch(snapshot: VoiceStudioCaptureSnapshot): void {
    this.#snapshot = snapshot;
    this.#listeners.forEach(listener => listener());
  }
}

export function createVoiceStudioRecordingCaptureLifecycle(): VoiceStudioRecordingCaptureLifecycle {
  return new VoiceStudioRecordingCaptureLifecycle();
}
