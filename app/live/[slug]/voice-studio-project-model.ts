export type VoiceStudioTrackKind = 'audio' | 'midi';

export type VoiceStudioMidiNote = {
  id: string;
  note: number;
  velocity: number;
  start: number;
  duration: number;
};

export type VoiceStudioAsset = {
  id: string;
  kind: VoiceStudioTrackKind;
  mimeType?: string;
  fileName?: string;
  duration: number;
  createdAt: string;
  peaks: number[];
  midiNotes: VoiceStudioMidiNote[];
  instrument?: string;
};

export type VoiceStudioClip = {
  id: string;
  assetId: string;
  name: string;
  start: number;
  sourceOffset: number;
  duration: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
};

export type VoiceStudioTrack = {
  id: string;
  kind: VoiceStudioTrackKind;
  name: string;
  color: string;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  instrument?: string;
  clips: VoiceStudioClip[];
};

export type VoiceStudioProject = {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tempo: number;
  timeSignature: [number, number];
  countInBars: number;
  metronomeDuringRecording: boolean;
  tracks: VoiceStudioTrack[];
  assets: Record<string, VoiceStudioAsset>;
};

export function createVoiceStudioProject(name = 'Novo projeto'): VoiceStudioProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    tempo: 90,
    timeSignature: [4, 4],
    countInBars: 1,
    metronomeDuringRecording: true,
    tracks: [],
    assets: {},
  };
}

export function cloneVoiceStudioProject(project: VoiceStudioProject): VoiceStudioProject {
  return {
    ...project,
    timeSignature: [...project.timeSignature] as [number, number],
    tracks: project.tracks.map(track => ({
      ...track,
      clips: track.clips.map(clip => ({ ...clip })),
    })),
    assets: Object.fromEntries(
      Object.entries(project.assets).map(([id, asset]) => [id, {
        ...asset,
        peaks: [...asset.peaks],
        midiNotes: asset.midiNotes.map(note => ({ ...note })),
      }]),
    ),
  };
}

export function projectDuration(project: VoiceStudioProject) {
  return Math.max(
    8,
    ...project.tracks.flatMap(track => track.clips.map(clip => clip.start + clip.duration)),
  );
}

export function splitClipInTrack(
  project: VoiceStudioProject,
  trackId: string,
  clipId: string,
  playhead: number,
  minimumDuration = 0.08,
): VoiceStudioProject {
  const next = cloneVoiceStudioProject(project);
  const track = next.tracks.find(item => item.id === trackId);
  const clipIndex = track?.clips.findIndex(item => item.id === clipId) ?? -1;
  if (!track || clipIndex < 0) return project;

  const clip = track.clips[clipIndex];
  const localSplit = playhead - clip.start;
  if (localSplit <= minimumDuration || localSplit >= clip.duration - minimumDuration) return project;

  const left: VoiceStudioClip = {
    ...clip,
    id: crypto.randomUUID(),
    duration: localSplit,
    fadeOut: Math.min(clip.fadeOut, localSplit),
  };
  const rightDuration = clip.duration - localSplit;
  const right: VoiceStudioClip = {
    ...clip,
    id: crypto.randomUUID(),
    name: `${clip.name} B`,
    start: playhead,
    sourceOffset: clip.sourceOffset + localSplit,
    duration: rightDuration,
    fadeIn: Math.min(clip.fadeIn, rightDuration),
  };

  track.clips.splice(clipIndex, 1, left, right);
  next.updatedAt = new Date().toISOString();
  return next;
}

export function moveClipBetweenTracks(
  project: VoiceStudioProject,
  sourceTrackId: string,
  targetTrackId: string,
  clipId: string,
  start: number,
): VoiceStudioProject {
  const next = cloneVoiceStudioProject(project);
  const source = next.tracks.find(track => track.id === sourceTrackId);
  const target = next.tracks.find(track => track.id === targetTrackId);
  const index = source?.clips.findIndex(clip => clip.id === clipId) ?? -1;
  if (!source || !target || index < 0 || source.kind !== target.kind) return project;
  const [clip] = source.clips.splice(index, 1);
  target.clips.push({ ...clip, start: Math.max(0, start) });
  target.clips.sort((a, b) => a.start - b.start);
  next.updatedAt = new Date().toISOString();
  return next;
}

export function removeUnusedAssets(project: VoiceStudioProject): VoiceStudioProject {
  const used = new Set(project.tracks.flatMap(track => track.clips.map(clip => clip.assetId)));
  const next = cloneVoiceStudioProject(project);
  next.assets = Object.fromEntries(Object.entries(next.assets).filter(([id]) => used.has(id)));
  next.updatedAt = new Date().toISOString();
  return next;
}
