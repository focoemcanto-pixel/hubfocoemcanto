import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioAssetStore } from './voice-studio-asset-store';
import { createVoiceStudioRuntime } from './voice-studio-runtime';

function fakeAudioBuffer(): AudioBuffer {
  return {
    duration: 2.5,
    getChannelData: () => new Float32Array([0, 0.25, -0.8, 0.4]),
  } as unknown as AudioBuffer;
}

function fakeAudioContext(buffer: AudioBuffer) {
  const context = {
    currentTime: 0,
    destination: {} as AudioDestinationNode,
    state: 'suspended' as AudioContextState,
    decodeAudioData: vi.fn(async () => buffer),
    resume: vi.fn(async () => { context.state = 'running'; }),
    suspend: vi.fn(async () => { context.state = 'suspended'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
  };
  return context;
}

describe('VoiceStudioAssetStore', () => {
  it('imports audio through Runtime and registers all derived resources', async () => {
    const buffer = fakeAudioBuffer();
    const context = fakeAudioContext(buffer);
    const runtime = createVoiceStudioRuntime({
      audioContextFactory: () => context as unknown as AudioContext,
      createObjectURL: () => 'blob:asset-a',
      revokeObjectURL: vi.fn(),
    });
    const store = createVoiceStudioAssetStore(runtime);
    const blob = new Blob(['audio'], { type: 'audio/wav' });

    const imported = await store.importAudio(blob, {
      assetId: 'asset-a',
      fileName: 'voz.wav',
      createdAt: '2026-07-19T00:00:00.000Z',
      waveformPoints: 4,
    });

    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(imported.asset).toMatchObject({
      id: 'asset-a',
      kind: 'audio',
      fileName: 'voz.wav',
      mimeType: 'audio/wav',
      duration: 2.5,
    });
    expect(imported.objectUrl).toBe('blob:asset-a');
    expect(store.getAsset('asset-a')).toBe(imported.asset);
    expect(store.getBlob('asset-a')).toBe(blob);
    expect(store.getDecodedAudio('asset-a')).toBe(buffer);
    expect(store.getWaveform('asset-a')).toHaveLength(4);
    expect(runtime.getObjectURL('asset-a')).toBe('blob:asset-a');
  });

  it('registers existing assets without creating parallel object URL state', () => {
    const createObjectURL = vi.fn(() => 'blob:registered');
    const runtime = createVoiceStudioRuntime({ createObjectURL, revokeObjectURL: vi.fn() });
    const store = createVoiceStudioAssetStore(runtime);
    const blob = new Blob(['audio']);
    const asset = {
      id: 'asset-b',
      kind: 'audio' as const,
      duration: 1,
      createdAt: '2026-07-19T00:00:00.000Z',
      peaks: [0.2],
      midiNotes: [],
    };

    store.registerAsset(asset, blob);

    expect(store.getObjectURL('asset-b')).toBe('blob:registered');
    expect(runtime.objectURLSnapshot()).toEqual({ 'asset-b': 'blob:registered' });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('removes and disposes resources through Runtime', async () => {
    const revokeObjectURL = vi.fn();
    const buffer = fakeAudioBuffer();
    const context = fakeAudioContext(buffer);
    const runtime = createVoiceStudioRuntime({
      audioContextFactory: () => context as unknown as AudioContext,
      createObjectURL: () => 'blob:asset-c',
      revokeObjectURL,
    });
    const store = createVoiceStudioAssetStore(runtime);

    await store.importAudio(new Blob(['audio']), { assetId: 'asset-c' });
    expect(store.remove('asset-c')).toBe(true);
    expect(store.getAsset('asset-c')).toBeUndefined();
    expect(runtime.getDecodedAudio('asset-c')).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:asset-c');

    store.dispose();
    expect(store.disposed).toBe(true);
    expect(() => store.registerAsset({
      id: 'late', kind: 'audio', duration: 1, createdAt: '', peaks: [], midiNotes: [],
    })).toThrow('VoiceStudioAssetStore has been disposed.');
  });
});
