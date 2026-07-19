export type VoiceStudioWaveformData = ReadonlyArray<number>;

export type VoiceStudioRuntimeScheduler = {
  schedule(delayMs: number, task: () => void): string;
  cancel(id: string): boolean;
  cancelAll(): void;
  readonly size: number;
};

export type VoiceStudioPlaybackClock = {
  readonly running: boolean;
  readonly position: number;
  start(position?: number): void;
  seek(position: number): void;
  stop(): number;
  reset(): void;
};

export type CreateVoiceStudioRuntimeOptions = {
  audioContextFactory?: () => AudioContext;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  setTimeout?: (task: () => void, delayMs: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout?: (handle: ReturnType<typeof globalThis.setTimeout>) => void;
};

class RuntimeScheduler implements VoiceStudioRuntimeScheduler {
  readonly #handles = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  readonly #setTimeout: NonNullable<CreateVoiceStudioRuntimeOptions['setTimeout']>;
  readonly #clearTimeout: NonNullable<CreateVoiceStudioRuntimeOptions['clearTimeout']>;
  constructor(options: CreateVoiceStudioRuntimeOptions) {
    this.#setTimeout = options.setTimeout ?? ((task, delayMs) => globalThis.setTimeout(task, delayMs));
    this.#clearTimeout = options.clearTimeout ?? (handle => globalThis.clearTimeout(handle));
  }
  schedule(delayMs: number, task: () => void): string {
    const id = crypto.randomUUID();
    const handle = this.#setTimeout(() => { this.#handles.delete(id); task(); }, Math.max(0, delayMs));
    this.#handles.set(id, handle);
    return id;
  }
  cancel(id: string): boolean {
    const handle = this.#handles.get(id);
    if (handle === undefined) return false;
    this.#clearTimeout(handle);
    this.#handles.delete(id);
    return true;
  }
  cancelAll(): void { this.#handles.forEach(handle => this.#clearTimeout(handle)); this.#handles.clear(); }
  get size(): number { return this.#handles.size; }
}

class RuntimePlaybackClock implements VoiceStudioPlaybackClock {
  readonly #now: () => number;
  #running = false;
  #position = 0;
  #startedAt = 0;
  constructor(now: () => number) { this.#now = now; }
  get running(): boolean { return this.#running; }
  get position(): number { return this.#running ? Math.max(0, this.#position + (this.#now() - this.#startedAt)) : this.#position; }
  start(position = this.#position): void { this.#position = Math.max(0, position); this.#startedAt = this.#now(); this.#running = true; }
  seek(position: number): void { this.#position = Math.max(0, position); if (this.#running) this.#startedAt = this.#now(); }
  stop(): number { this.#position = this.position; this.#running = false; return this.#position; }
  reset(): void { this.#running = false; this.#position = 0; this.#startedAt = 0; }
}

export class VoiceStudioRuntime {
  readonly scheduler: VoiceStudioRuntimeScheduler;
  readonly playbackClock: VoiceStudioPlaybackClock;
  readonly #audioContextFactory: () => AudioContext;
  readonly #createObjectURL: (blob: Blob) => string;
  readonly #revokeObjectURL: (url: string) => void;
  readonly #objectUrls = new Map<string, string>();
  readonly #decodedAudio = new Map<string, AudioBuffer>();
  readonly #waveforms = new Map<string, VoiceStudioWaveformData>();
  #audioContext: AudioContext | null = null;
  #disposed = false;

  constructor(options: CreateVoiceStudioRuntimeOptions = {}) {
    this.#audioContextFactory = options.audioContextFactory ?? (() => new AudioContext());
    this.#createObjectURL = options.createObjectURL ?? (blob => URL.createObjectURL(blob));
    this.#revokeObjectURL = options.revokeObjectURL ?? (url => URL.revokeObjectURL(url));
    this.scheduler = new RuntimeScheduler(options);
    this.playbackClock = new RuntimePlaybackClock(() => this.currentTime);
  }
  get disposed(): boolean { return this.#disposed; }
  get initialized(): boolean { return this.#audioContext !== null; }
  get currentTime(): number { return this.#audioContext?.currentTime ?? 0; }
  get destination(): AudioDestinationNode { return this.#ensureAudioContext().destination; }
  audioContextForPlayback(): AudioContext { return this.#ensureAudioContext(); }
  async resume(): Promise<void> { const context = this.#ensureAudioContext(); if (context.state === 'suspended') await context.resume(); }
  async suspend(): Promise<void> { if (this.#audioContext?.state === 'running') await this.#audioContext.suspend(); }
  async decodeAudio(assetId: string, data: ArrayBuffer): Promise<AudioBuffer> {
    const cached = this.#decodedAudio.get(assetId);
    if (cached) return cached;
    const buffer = await this.#ensureAudioContext().decodeAudioData(data.slice(0));
    this.#decodedAudio.set(assetId, buffer);
    return buffer;
  }
  registerObjectURL(assetId: string, blob: Blob): string {
    this.revokeObjectURL(assetId);
    const url = this.#createObjectURL(blob);
    this.#objectUrls.set(assetId, url);
    return url;
  }
  getObjectURL(assetId: string): string | undefined { return this.#objectUrls.get(assetId); }
  objectURLSnapshot(): Readonly<Record<string, string>> { return Object.fromEntries(this.#objectUrls); }
  revokeObjectURL(assetId: string): boolean {
    const url = this.#objectUrls.get(assetId);
    if (!url) return false;
    this.#revokeObjectURL(url);
    this.#objectUrls.delete(assetId);
    return true;
  }
  cacheDecodedAudio(assetId: string, audioBuffer: AudioBuffer): void { this.#decodedAudio.set(assetId, audioBuffer); }
  getDecodedAudio(assetId: string): AudioBuffer | undefined { return this.#decodedAudio.get(assetId); }
  deleteDecodedAudio(assetId: string): boolean { return this.#decodedAudio.delete(assetId); }
  cacheWaveform(assetId: string, waveform: VoiceStudioWaveformData): void { this.#waveforms.set(assetId, waveform); }
  getWaveform(assetId: string): VoiceStudioWaveformData | undefined { return this.#waveforms.get(assetId); }
  deleteWaveform(assetId: string): boolean { return this.#waveforms.delete(assetId); }
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.scheduler.cancelAll();
    this.playbackClock.reset();
    this.#objectUrls.forEach(url => this.#revokeObjectURL(url));
    this.#objectUrls.clear();
    this.#decodedAudio.clear();
    this.#waveforms.clear();
    const context = this.#audioContext;
    this.#audioContext = null;
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
  }
  #ensureAudioContext(): AudioContext {
    if (this.#disposed) throw new Error('VoiceStudioRuntime has been disposed.');
    this.#audioContext ??= this.#audioContextFactory();
    return this.#audioContext;
  }
}

export function createVoiceStudioRuntime(options: CreateVoiceStudioRuntimeOptions = {}): VoiceStudioRuntime {
  return new VoiceStudioRuntime(options);
}
