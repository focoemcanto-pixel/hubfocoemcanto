import { describe, expect, it, vi } from 'vitest';
import { createVoiceStudioProject } from './voice-studio-project-model';
import { VoiceStudioLegacySessionBridge } from './voice-studio-legacy-session-bridge';
import type { VoiceStudioSession } from './voice-studio-session-types';

function createSessionDouble() {
  const assets = new Map<string, unknown>([['obsolete', { id: 'obsolete' }]]);
  const session = {
    actions: { replace: vi.fn((project) => project) },
    assetStore: {
      assetsSnapshot: vi.fn(() => Object.fromEntries(assets)),
      remove: vi.fn((id: string) => assets.delete(id)),
      registerAsset: vi.fn((asset: { id: string }) => { assets.set(asset.id, asset); return asset; }),
    },
    transport: {
      setTempo: vi.fn(),
      setCountInBars: vi.fn(),
      setLoop: vi.fn(),
      seek: vi.fn(),
    },
  } as unknown as VoiceStudioSession;
  return { session, assets };
}

describe('VoiceStudioLegacySessionBridge', () => {
  it('replaces the Session project and synchronizes transport settings', () => {
    const { session } = createSessionDouble();
    const project = createVoiceStudioProject({ tempo: 128, countInBars: 2 });
    project.view.playhead = 6.5;
    project.loop = { enabled: true, start: 4, end: 12 };

    new VoiceStudioLegacySessionBridge(session).apply({ project });

    expect(session.actions.replace).toHaveBeenCalledWith(project, 'bridge');
    expect(session.transport.setTempo).toHaveBeenCalledWith(128);
    expect(session.transport.setCountInBars).toHaveBeenCalledWith(2);
    expect(session.transport.setLoop).toHaveBeenCalledWith(project.loop);
    expect(session.transport.seek).toHaveBeenCalledWith(6.5);
  });

  it('registers current assets with blobs and removes stale assets', () => {
    const { session } = createSessionDouble();
    const project = createVoiceStudioProject();
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    project.assets.voice = {
      id: 'voice', kind: 'audio', duration: 1, createdAt: new Date().toISOString(),
      mimeType: 'audio/webm', peaks: [0.2], midiNotes: [],
    };

    new VoiceStudioLegacySessionBridge(session).apply({ project, blobs: { voice: blob } });

    expect(session.assetStore.remove).toHaveBeenCalledWith('obsolete');
    expect(session.assetStore.registerAsset).toHaveBeenCalledWith(project.assets.voice, blob);
  });
});
