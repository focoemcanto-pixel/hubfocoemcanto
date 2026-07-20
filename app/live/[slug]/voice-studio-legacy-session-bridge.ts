import type { VoiceStudioProject } from './voice-studio-project-model';
import type { VoiceStudioSession } from './voice-studio-session-types';

export const VOICE_STUDIO_SNAPSHOT_EVENT = 'foco-voice-studio-snapshot';
export const VOICE_STUDIO_REQUEST_SNAPSHOT_EVENT = 'foco-voice-studio-request-snapshot';

export type VoiceStudioLegacySnapshot = {
  project: VoiceStudioProject;
  blobs?: Record<string, Blob>;
};

export class VoiceStudioLegacySessionBridge {
  readonly #session: VoiceStudioSession;

  constructor(session: VoiceStudioSession) {
    this.#session = session;
  }

  apply(snapshot: VoiceStudioLegacySnapshot): void {
    if (!snapshot?.project) return;
    const blobs = snapshot.blobs ?? {};
    const nextAssetIds = new Set(Object.keys(snapshot.project.assets));

    Object.keys(this.#session.assetStore.assetsSnapshot()).forEach(assetId => {
      if (!nextAssetIds.has(assetId)) this.#session.assetStore.remove(assetId);
    });

    Object.values(snapshot.project.assets).forEach(asset => {
      this.#session.assetStore.registerAsset(asset, blobs[asset.id]);
    });

    const project = this.#session.actions.replace(snapshot.project, 'bridge');
    this.#session.transport.setTempo(project.tempo);
    this.#session.transport.setCountInBars(project.countInBars);
    this.#session.transport.setLoop(project.loop);
    this.#session.transport.seek(project.view.playhead);
  }

  bind(target: Window = window): () => void {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<VoiceStudioLegacySnapshot>).detail;
      if (detail?.project) this.apply(detail);
    };

    target.addEventListener(VOICE_STUDIO_SNAPSHOT_EVENT, receive);
    target.dispatchEvent(new CustomEvent(VOICE_STUDIO_REQUEST_SNAPSHOT_EVENT));
    return () => target.removeEventListener(VOICE_STUDIO_SNAPSHOT_EVENT, receive);
  }
}

export function createVoiceStudioLegacySessionBridge(session: VoiceStudioSession): VoiceStudioLegacySessionBridge {
  return new VoiceStudioLegacySessionBridge(session);
}
