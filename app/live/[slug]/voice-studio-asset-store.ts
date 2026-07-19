import type { VoiceStudioEventBus } from './voice-studio-event-bus';
import type { VoiceStudioAsset } from './voice-studio-project-model';
import type { VoiceStudioRuntime } from './voice-studio-runtime';

export type ImportVoiceStudioAudioOptions = {
  assetId?: string;
  fileName?: string;
  mimeType?: string;
  createdAt?: string;
  waveformPoints?: number;
};

export type ImportedVoiceStudioAudio = {
  asset: VoiceStudioAsset;
  blob: Blob;
  objectUrl: string;
  audioBuffer: AudioBuffer;
};

function waveformFromBuffer(buffer: AudioBuffer, pointCount: number): number[] {
  const data = buffer.getChannelData(0);
  const count = Math.max(1, Math.floor(pointCount));
  const step = Math.max(1, Math.floor(data.length / count));
  return Array.from({ length: count }, (_, index) => {
    let maximum = 0;
    const end = Math.min(data.length, (index + 1) * step);
    for (let cursor = index * step; cursor < end; cursor += 1) maximum = Math.max(maximum, Math.abs(data[cursor]));
    return Math.max(0.03, maximum);
  });
}

export class VoiceStudioAssetStore {
  readonly #runtime: VoiceStudioRuntime;
  readonly #eventBus: VoiceStudioEventBus;
  readonly #assets = new Map<string, VoiceStudioAsset>();
  readonly #blobs = new Map<string, Blob>();
  #disposed = false;

  constructor(runtime: VoiceStudioRuntime, eventBus: VoiceStudioEventBus) {
    this.#runtime = runtime;
    this.#eventBus = eventBus;
  }

  get disposed(): boolean { return this.#disposed; }
  get size(): number { return this.#assets.size; }

  registerAsset(asset: VoiceStudioAsset, blob?: Blob): VoiceStudioAsset {
    this.#assertActive();
    this.#assets.set(asset.id, asset);
    if (blob) {
      this.#blobs.set(asset.id, blob);
      this.#runtime.registerObjectURL(asset.id, blob);
    }
    if (asset.peaks.length) this.#runtime.cacheWaveform(asset.id, asset.peaks);
    this.#eventBus.publish('ASSET_IMPORTED', { asset, blob });
    return asset;
  }

  async importAudio(blob: Blob, options: ImportVoiceStudioAudioOptions = {}): Promise<ImportedVoiceStudioAudio> {
    this.#assertActive();
    const assetId = options.assetId ?? crypto.randomUUID();
    const audioBuffer = await this.#runtime.decodeAudio(assetId, await blob.arrayBuffer());
    const peaks = waveformFromBuffer(audioBuffer, options.waveformPoints ?? 180);
    const asset: VoiceStudioAsset = {
      id: assetId,
      kind: 'audio',
      mimeType: options.mimeType ?? (blob.type || 'audio/mpeg'),
      fileName: options.fileName,
      duration: Math.max(0.08, audioBuffer.duration),
      createdAt: options.createdAt ?? new Date().toISOString(),
      peaks,
      midiNotes: [],
    };
    this.#assets.set(assetId, asset);
    this.#blobs.set(assetId, blob);
    this.#runtime.cacheWaveform(assetId, peaks);
    const objectUrl = this.#runtime.registerObjectURL(assetId, blob);
    this.#eventBus.publish('ASSET_IMPORTED', { asset, blob });
    return { asset, blob, objectUrl, audioBuffer };
  }

  getAsset(assetId: string): VoiceStudioAsset | undefined { return this.#assets.get(assetId); }
  getBlob(assetId: string): Blob | undefined { return this.#blobs.get(assetId); }
  getObjectURL(assetId: string): string | undefined { return this.#runtime.getObjectURL(assetId); }
  getDecodedAudio(assetId: string): AudioBuffer | undefined { return this.#runtime.getDecodedAudio(assetId); }
  getWaveform(assetId: string): ReadonlyArray<number> | undefined { return this.#runtime.getWaveform(assetId); }
  assetsSnapshot(): Readonly<Record<string, VoiceStudioAsset>> { return Object.fromEntries(this.#assets); }
  blobsSnapshot(): Readonly<Record<string, Blob>> { return Object.fromEntries(this.#blobs); }

  remove(assetId: string): boolean {
    const existed = this.#assets.delete(assetId) || this.#blobs.delete(assetId);
    this.#blobs.delete(assetId);
    this.#runtime.revokeObjectURL(assetId);
    this.#runtime.deleteDecodedAudio(assetId);
    this.#runtime.deleteWaveform(assetId);
    return existed;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const ids = new Set([...this.#assets.keys(), ...this.#blobs.keys()]);
    ids.forEach(assetId => {
      this.#runtime.revokeObjectURL(assetId);
      this.#runtime.deleteDecodedAudio(assetId);
      this.#runtime.deleteWaveform(assetId);
    });
    this.#assets.clear();
    this.#blobs.clear();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('VoiceStudioAssetStore has been disposed.');
  }
}

export function createVoiceStudioAssetStore(runtime: VoiceStudioRuntime, eventBus: VoiceStudioEventBus): VoiceStudioAssetStore {
  return new VoiceStudioAssetStore(runtime, eventBus);
}
