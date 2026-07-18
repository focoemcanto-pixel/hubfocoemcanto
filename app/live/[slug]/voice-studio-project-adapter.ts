import {
  createVoiceStudioProject,
  type VoiceStudioAsset,
  type VoiceStudioClip,
  type VoiceStudioMidiNote,
  type VoiceStudioProject,
  type VoiceStudioTrack,
  type VoiceStudioTrackKind,
} from './voice-studio-project-model';

export type LegacyVoiceStudioTrack = {
  id: string;
  kind: VoiceStudioTrackKind;
  name: string;
  color: string;
  url?: string;
  blob?: Blob;
  start: number;
  sourceOffset: number;
  duration: number;
  sourceDuration: number;
  peaks: number[];
  notes: VoiceStudioMidiNote[];
  instrument: string;
  muted: boolean;
  solo: boolean;
  volume: number;
};

export type AdaptedVoiceStudioProject = {
  project: VoiceStudioProject;
  blobs: Record<string, Blob>;
  objectUrls: Record<string, string>;
};

export function legacyTracksToProject(
  tracks: LegacyVoiceStudioTrack[],
  options?: {
    project?: VoiceStudioProject;
    name?: string;
    tempo?: number;
    countInBars?: number;
    metronomeDuringRecording?: boolean;
  },
): AdaptedVoiceStudioProject {
  const base = options?.project ?? createVoiceStudioProject(options?.name);
  const assets: Record<string, VoiceStudioAsset> = { ...base.assets };
  const blobs: Record<string, Blob> = {};
  const objectUrls: Record<string, string> = {};

  const projectTracks: VoiceStudioTrack[] = tracks.map((legacy, index) => {
    const assetId = `asset-${legacy.id}`;
    const clipId = `clip-${legacy.id}`;
    const sourceDuration = Math.max(legacy.sourceDuration || legacy.duration, legacy.duration);

    assets[assetId] = {
      id: assetId,
      kind: legacy.kind,
      mimeType: legacy.blob?.type,
      fileName: `${legacy.name || `Faixa ${index + 1}`}.${legacy.kind === 'midi' ? 'mid' : 'webm'}`,
      duration: sourceDuration,
      createdAt: new Date().toISOString(),
      peaks: [...legacy.peaks],
      midiNotes: legacy.notes.map(note => ({ ...note })),
      instrument: legacy.instrument,
    };

    if (legacy.blob) blobs[assetId] = legacy.blob;
    if (legacy.url) objectUrls[assetId] = legacy.url;

    const clip: VoiceStudioClip = {
      id: clipId,
      assetId,
      name: legacy.name || `Clip ${index + 1}`,
      start: Math.max(0, legacy.start),
      sourceOffset: Math.max(0, legacy.sourceOffset),
      duration: Math.max(0.08, legacy.duration),
      gain: 1,
      fadeIn: 0,
      fadeOut: 0,
    };

    return {
      id: legacy.id,
      kind: legacy.kind,
      name: legacy.name || `Faixa ${index + 1}`,
      color: legacy.color,
      muted: legacy.muted,
      solo: legacy.solo,
      volume: legacy.volume,
      pan: 0,
      instrument: legacy.instrument,
      clips: [clip],
    };
  });

  return {
    project: {
      ...base,
      name: options?.name ?? base.name,
      updatedAt: new Date().toISOString(),
      tempo: options?.tempo ?? base.tempo,
      countInBars: options?.countInBars ?? base.countInBars,
      metronomeDuringRecording: options?.metronomeDuringRecording ?? base.metronomeDuringRecording,
      tracks: projectTracks,
      assets,
    },
    blobs,
    objectUrls,
  };
}

export function projectToLegacyTracks(
  project: VoiceStudioProject,
  blobs: Record<string, Blob> = {},
  objectUrls: Record<string, string> = {},
): LegacyVoiceStudioTrack[] {
  return project.tracks.flatMap(track => track.clips.flatMap((clip, clipIndex) => {
    const asset = project.assets[clip.assetId];
    if (!asset) return [];
    const suffix = track.clips.length > 1 ? ` ${clipIndex + 1}` : '';

    return [{
      id: clip.id,
      kind: track.kind,
      name: `${track.name}${suffix}`,
      color: track.color,
      url: objectUrls[clip.assetId],
      blob: blobs[clip.assetId],
      start: clip.start,
      sourceOffset: clip.sourceOffset,
      duration: clip.duration,
      sourceDuration: asset.duration,
      peaks: [...asset.peaks],
      notes: asset.midiNotes.map(note => ({ ...note })),
      instrument: track.instrument ?? asset.instrument ?? 'piano',
      muted: track.muted,
      solo: track.solo,
      volume: track.volume * clip.gain,
    } satisfies LegacyVoiceStudioTrack];
  }));
}
