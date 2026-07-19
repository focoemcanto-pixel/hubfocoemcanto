export type VoiceStudioTrackKind = 'audio' | 'midi';

export type VoiceStudioMidiNote = {
  id: string;
  note: number;
  velocity: number;
  start: number;
  duration: number;
};

export type VoiceStudioMarker = {
  id: string;
  name: string;
  time: number;
  color?: string;
};

export type VoiceStudioAutomationPoint = {
  id: string;
  time: number;
  value: number;
};

export type VoiceStudioAutomationLane = {
  id: string;
  target: 'volume' | 'pan' | 'gain' | string;
  trackId?: string;
  clipId?: string;
  points: VoiceStudioAutomationPoint[];
};

export type VoiceStudioAsset = {
  id: string;
  kind: VoiceStudioTrackKind;
  libraryItemId?: string;
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
  color?: string;
  muted: boolean;
  locked: boolean;
  groupId?: string;
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
  schemaVersion: 2;
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
  markers: VoiceStudioMarker[];
  view: {
    zoom: number;
    verticalZoom: number;
    scrollLeft: number;
    scrollTop: number;
    playhead: number;
  };
  loop: {
    enabled: boolean;
    start: number;
    end: number;
  };
  settings: {
    snapping: boolean;
    snapDivision: number;
  };
  automation: VoiceStudioAutomationLane[];
};

export type VoiceStudioClipLocation = {
  trackId: string;
  trackIndex: number;
  clipIndex: number;
  track: VoiceStudioTrack;
  clip: VoiceStudioClip;
};

export type VoiceStudioClipboardClip = {
  sourceTrackId: string;
  clip: VoiceStudioClip;
};

type LegacyTrackMediaFields = {
  audio?: unknown;
  waveform?: unknown;
  peaks?: unknown;
  trimStart?: unknown;
  trimEnd?: unknown;
  sourceOffset?: unknown;
  offset?: unknown;
  duration?: unknown;
  blob?: unknown;
  blobUrl?: unknown;
  url?: unknown;
};

const TRACK_COLORS = ['#22c55e', '#8b5cf6', '#0ea5e9', '#f97316', '#ec4899', '#eab308'];
const MINIMUM_CLIP_DURATION = 0.08;

function now() {
  return new Date().toISOString();
}

function sanitizeTrackContainer(track: VoiceStudioTrack): VoiceStudioTrack {
  const { audio: _audio, waveform: _waveform, peaks: _peaks, trimStart: _trimStart, trimEnd: _trimEnd, sourceOffset: _sourceOffset, offset: _offset, duration: _duration, blob: _blob, blobUrl: _blobUrl, url: _url, ...container } = track as VoiceStudioTrack & LegacyTrackMediaFields;
  return container;
}

function normalizeProjectView(view: Partial<VoiceStudioProject['view']> | undefined): VoiceStudioProject['view'] {
  return {
    zoom: Number.isFinite(view?.zoom) ? Number(view?.zoom) : 1,
    verticalZoom: Number.isFinite(view?.verticalZoom) ? Number(view?.verticalZoom) : 1,
    scrollLeft: Number.isFinite(view?.scrollLeft) ? Number(view?.scrollLeft) : 0,
    scrollTop: Number.isFinite(view?.scrollTop) ? Number(view?.scrollTop) : 0,
    playhead: Number.isFinite(view?.playhead) ? Number(view?.playhead) : 0,
  };
}

function normalizeClip(clip: VoiceStudioClip): VoiceStudioClip {
  return {
    ...clip,
    gain: Number.isFinite(clip.gain) ? clip.gain : 1,
    fadeIn: Number.isFinite(clip.fadeIn) ? clip.fadeIn : 0,
    fadeOut: Number.isFinite(clip.fadeOut) ? clip.fadeOut : 0,
    muted: clip.muted ?? false,
    locked: clip.locked ?? false,
  };
}

export function createVoiceStudioProject(name = 'Novo projeto'): VoiceStudioProject {
  const timestamp = now();
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    tempo: 90,
    timeSignature: [4, 4],
    countInBars: 1,
    metronomeDuringRecording: true,
    tracks: [],
    assets: {},
    markers: [],
    view: { zoom: 1, verticalZoom: 1, scrollLeft: 0, scrollTop: 0, playhead: 0 },
    loop: { enabled: false, start: 0, end: 4 },
    settings: { snapping: true, snapDivision: 0.5 },
    automation: [],
  };
}

export function normalizeVoiceStudioProject(project: VoiceStudioProject): VoiceStudioProject {
  return {
    ...project,
    schemaVersion: 2,
    tracks: (project.tracks ?? []).map(track => {
      const container = sanitizeTrackContainer(track);
      return {
        ...container,
        pan: Number.isFinite(container.pan) ? container.pan : 0,
        clips: (container.clips ?? []).map(normalizeClip),
      };
    }),
    assets: project.assets ?? {},
    markers: project.markers ?? [],
    view: normalizeProjectView(project.view),
    loop: project.loop ?? { enabled: false, start: 0, end: 4 },
    settings: project.settings ?? { snapping: true, snapDivision: 0.5 },
    automation: project.automation ?? [],
  };
}

export function cloneVoiceStudioProject(project: VoiceStudioProject): VoiceStudioProject {
  const normalized = normalizeVoiceStudioProject(project);
  return {
    ...normalized,
    timeSignature: [...normalized.timeSignature] as [number, number],
    tracks: normalized.tracks.map(track => ({
      ...track,
      clips: track.clips.map(clip => ({ ...clip })),
    })),
    assets: Object.fromEntries(
      Object.entries(normalized.assets).map(([id, asset]) => [id, {
        ...asset,
        peaks: [...asset.peaks],
        midiNotes: asset.midiNotes.map(note => ({ ...note })),
      }]),
    ),
    markers: normalized.markers.map(marker => ({ ...marker })),
    view: { ...normalized.view },
    loop: { ...normalized.loop },
    settings: { ...normalized.settings },
    automation: normalized.automation.map(lane => ({ ...lane, points: lane.points.map(point => ({ ...point })) })),
  };
}


export function createTrackContainer(input: {
  kind: VoiceStudioTrackKind;
  name: string;
  color?: string;
  index?: number;
  instrument?: string;
}): VoiceStudioTrack {
  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    name: input.name,
    color: input.color ?? TRACK_COLORS[Math.max(0, input.index ?? 0) % TRACK_COLORS.length],
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    instrument: input.instrument,
    clips: [],
  };
}

export function createClipFromAsset(input: {
  asset: VoiceStudioAsset;
  name?: string;
  start?: number;
  sourceOffset?: number;
  duration?: number;
  color?: string;
}): VoiceStudioClip {
  const sourceOffset = Math.max(0, input.sourceOffset ?? 0);
  const maxDuration = Math.max(MINIMUM_CLIP_DURATION, input.asset.duration - sourceOffset);
  return {
    id: crypto.randomUUID(),
    assetId: input.asset.id,
    name: input.name ?? input.asset.fileName ?? 'Clip',
    start: Math.max(0, input.start ?? 0),
    sourceOffset,
    duration: Math.min(maxDuration, Math.max(MINIMUM_CLIP_DURATION, input.duration ?? maxDuration)),
    gain: 1,
    fadeIn: 0,
    fadeOut: 0,
    color: input.color,
    muted: false,
    locked: false,
  };
}

export function addAssetClipToProject(project: VoiceStudioProject, asset: VoiceStudioAsset, clipName: string, start: number, targetTrackId?: string): VoiceStudioProject {
  const next = cloneVoiceStudioProject(project);
  next.assets[asset.id] = { ...asset, peaks: [...asset.peaks], midiNotes: asset.midiNotes.map(note => ({ ...note })) };
  let track = targetTrackId ? next.tracks.find(item => item.id === targetTrackId && item.kind === asset.kind) : null;
  if (!track) {
    track = createTrackContainer({ kind: asset.kind, name: clipName, index: next.tracks.length, instrument: asset.instrument });
    next.tracks.push(track);
  }
  track.clips.push(createClipFromAsset({ asset, name: clipName, start }));
  track.clips.sort((a, b) => a.start - b.start);
  next.updatedAt = now();
  return next;
}

export function projectDuration(project: VoiceStudioProject) {
  return Math.max(8, ...project.tracks.flatMap(track => track.clips.map(clip => clip.start + clip.duration)));
}

export function findClip(project: VoiceStudioProject, clipId: string): VoiceStudioClipLocation | null {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex += 1) {
    const track = project.tracks[trackIndex];
    const clipIndex = track.clips.findIndex(clip => clip.id === clipId);
    if (clipIndex >= 0) return { trackId: track.id, trackIndex, clipIndex, track, clip: track.clips[clipIndex] };
  }
  return null;
}

export function splitClip(project: VoiceStudioProject, clipId: string, playhead: number, minimumDuration = MINIMUM_CLIP_DURATION): VoiceStudioProject {
  const location = findClip(project, clipId);
  if (!location || location.clip.locked) return project;
  const localSplit = playhead - location.clip.start;
  if (localSplit <= minimumDuration || localSplit >= location.clip.duration - minimumDuration) return project;

  const next = cloneVoiceStudioProject(project);
  const track = next.tracks[location.trackIndex];
  const clip = track.clips[location.clipIndex];
  const rightDuration = clip.duration - localSplit;
  const left: VoiceStudioClip = {
    ...clip,
    id: crypto.randomUUID(),
    duration: localSplit,
    fadeOut: Math.min(clip.fadeOut, localSplit),
  };
  const right: VoiceStudioClip = {
    ...clip,
    id: crypto.randomUUID(),
    name: `${clip.name} B`,
    start: playhead,
    sourceOffset: clip.sourceOffset + localSplit,
    duration: rightDuration,
    fadeIn: Math.min(clip.fadeIn, rightDuration),
  };
  track.clips.splice(location.clipIndex, 1, left, right);
  next.updatedAt = now();
  return next;
}

export function moveClip(project: VoiceStudioProject, clipId: string, targetTrackId: string, start: number): VoiceStudioProject {
  const location = findClip(project, clipId);
  const target = project.tracks.find(track => track.id === targetTrackId);
  if (!location || !target || location.clip.locked || target.kind !== location.track.kind) return project;

  const next = cloneVoiceStudioProject(project);
  const sourceTrack = next.tracks[location.trackIndex];
  const targetTrack = next.tracks.find(track => track.id === targetTrackId);
  if (!targetTrack) return project;
  const [clip] = sourceTrack.clips.splice(location.clipIndex, 1);
  targetTrack.clips.push({ ...clip, start: Math.max(0, start) });
  targetTrack.clips.sort((a, b) => a.start - b.start);
  next.updatedAt = now();
  return next;
}

export function resizeClip(
  project: VoiceStudioProject,
  clipId: string,
  edge: 'left' | 'right',
  value: number,
  minimumDuration = MINIMUM_CLIP_DURATION,
): VoiceStudioProject {
  const location = findClip(project, clipId);
  if (!location || location.clip.locked) return project;
  const asset = project.assets[location.clip.assetId];
  if (!asset) return project;

  const next = cloneVoiceStudioProject(project);
  const clip = next.tracks[location.trackIndex].clips[location.clipIndex];
  if (edge === 'right') {
    const maxDuration = Math.max(minimumDuration, asset.duration - clip.sourceOffset);
    clip.duration = Math.min(maxDuration, Math.max(minimumDuration, value));
  } else {
    const proposedStart = Math.max(0, value);
    const delta = proposedStart - clip.start;
    const maxPositiveDelta = clip.duration - minimumDuration;
    const applied = Math.min(maxPositiveDelta, Math.max(-clip.sourceOffset, delta));
    clip.start += applied;
    clip.sourceOffset += applied;
    clip.duration -= applied;
  }
  clip.fadeIn = Math.min(clip.fadeIn, clip.duration);
  clip.fadeOut = Math.min(clip.fadeOut, clip.duration);
  next.updatedAt = now();
  return next;
}

export function duplicateClip(project: VoiceStudioProject, clipId: string, start?: number, targetTrackId?: string): VoiceStudioProject {
  const location = findClip(project, clipId);
  if (!location) return project;
  const destinationId = targetTrackId ?? location.trackId;
  const destination = project.tracks.find(track => track.id === destinationId);
  if (!destination || destination.kind !== location.track.kind) return project;

  const next = cloneVoiceStudioProject(project);
  const targetTrack = next.tracks.find(track => track.id === destinationId);
  if (!targetTrack) return project;
  targetTrack.clips.push({
    ...location.clip,
    id: crypto.randomUUID(),
    name: `${location.clip.name} cópia`,
    start: Math.max(0, start ?? location.clip.start + location.clip.duration),
  });
  targetTrack.clips.sort((a, b) => a.start - b.start);
  next.updatedAt = now();
  return next;
}

export function deleteClip(project: VoiceStudioProject, clipId: string): VoiceStudioProject {
  const location = findClip(project, clipId);
  if (!location || location.clip.locked) return project;
  const next = cloneVoiceStudioProject(project);
  next.tracks[location.trackIndex].clips.splice(location.clipIndex, 1);
  next.updatedAt = now();
  return next;
}

export function copyClip(project: VoiceStudioProject, clipId: string): VoiceStudioClipboardClip | null {
  const location = findClip(project, clipId);
  return location ? { sourceTrackId: location.trackId, clip: { ...location.clip } } : null;
}

export function pasteClip(project: VoiceStudioProject, clipboard: VoiceStudioClipboardClip, start: number, targetTrackId?: string): VoiceStudioProject {
  if (!project.assets[clipboard.clip.assetId]) return project;
  const sourceTrack = project.tracks.find(track => track.id === clipboard.sourceTrackId);
  const destination = project.tracks.find(track => track.id === (targetTrackId ?? clipboard.sourceTrackId));
  if (!sourceTrack || !destination || sourceTrack.kind !== destination.kind) return project;

  const next = cloneVoiceStudioProject(project);
  const target = next.tracks.find(track => track.id === destination.id);
  if (!target) return project;
  target.clips.push({
    ...clipboard.clip,
    id: crypto.randomUUID(),
    name: `${clipboard.clip.name} cópia`,
    start: Math.max(0, start),
  });
  target.clips.sort((a, b) => a.start - b.start);
  next.updatedAt = now();
  return next;
}

export function removeUnusedAssets(project: VoiceStudioProject): VoiceStudioProject {
  const used = new Set(project.tracks.flatMap(track => track.clips.map(clip => clip.assetId)));
  const next = cloneVoiceStudioProject(project);
  next.assets = Object.fromEntries(Object.entries(next.assets).filter(([id]) => used.has(id)));
  next.updatedAt = now();
  return next;
}
