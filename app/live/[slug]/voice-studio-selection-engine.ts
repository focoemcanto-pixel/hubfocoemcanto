import { findClip, type VoiceStudioClipLocation, type VoiceStudioProject } from './voice-studio-project-model';

export type VoiceStudioSelectionMode = 'replace' | 'add' | 'toggle' | 'range';

export type VoiceStudioSelectionState = {
  clipIds: Set<string>;
  anchorClipId: string | null;
  focusClipId: string | null;
};

export type VoiceStudioSelectionRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export const EMPTY_SELECTION: VoiceStudioSelectionState = {
  clipIds: new Set<string>(),
  anchorClipId: null,
  focusClipId: null,
};

export function createSelectionState(ids: Iterable<string> = [], focusClipId: string | null = null): VoiceStudioSelectionState {
  const clipIds = new Set(ids);
  const focus = focusClipId && clipIds.has(focusClipId) ? focusClipId : Array.from(clipIds).at(-1) ?? null;
  return { clipIds, anchorClipId: focus, focusClipId: focus };
}

export function allClipIds(project: VoiceStudioProject) {
  return project.tracks.flatMap(track => track.clips.map(clip => clip.id));
}

export function selectedClipLocations(project: VoiceStudioProject, selection: VoiceStudioSelectionState): VoiceStudioClipLocation[] {
  return Array.from(selection.clipIds).map(id => findClip(project, id)).filter((value): value is VoiceStudioClipLocation => Boolean(value));
}

export function reconcileSelection(project: VoiceStudioProject, selection: VoiceStudioSelectionState): VoiceStudioSelectionState {
  const valid = new Set(allClipIds(project));
  const clipIds = new Set(Array.from(selection.clipIds).filter(id => valid.has(id)));
  const focusClipId = selection.focusClipId && clipIds.has(selection.focusClipId) ? selection.focusClipId : Array.from(clipIds).at(-1) ?? null;
  const anchorClipId = selection.anchorClipId && clipIds.has(selection.anchorClipId) ? selection.anchorClipId : focusClipId;
  const unchanged = clipIds.size === selection.clipIds.size
    && Array.from(clipIds).every(id => selection.clipIds.has(id))
    && focusClipId === selection.focusClipId
    && anchorClipId === selection.anchorClipId;
  return unchanged ? selection : { clipIds, anchorClipId, focusClipId };
}

export function selectAllClips(project: VoiceStudioProject): VoiceStudioSelectionState {
  return createSelectionState(allClipIds(project));
}

export function deselectAllClips(): VoiceStudioSelectionState {
  return createSelectionState();
}

function rangeIds(project: VoiceStudioProject, anchorId: string | null, targetId: string) {
  const ids = allClipIds(project);
  const anchorIndex = anchorId ? ids.indexOf(anchorId) : -1;
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0) return [];
  if (anchorIndex < 0) return [targetId];
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return ids.slice(start, end + 1);
}

export function selectClipById(project: VoiceStudioProject, selection: VoiceStudioSelectionState, clipId: string, mode: VoiceStudioSelectionMode): VoiceStudioSelectionState {
  if (!findClip(project, clipId)) return reconcileSelection(project, selection);
  if (mode === 'replace') return createSelectionState([clipId], clipId);
  if (mode === 'range') {
    const clipIds = new Set(selection.clipIds);
    rangeIds(project, selection.anchorClipId ?? selection.focusClipId, clipId).forEach(id => clipIds.add(id));
    return { clipIds, anchorClipId: selection.anchorClipId ?? clipId, focusClipId: clipId };
  }
  const clipIds = new Set(selection.clipIds);
  if (mode === 'toggle' && clipIds.has(clipId)) clipIds.delete(clipId);
  else clipIds.add(clipId);
  const focusClipId = clipIds.has(clipId) ? clipId : Array.from(clipIds).at(-1) ?? null;
  return { clipIds, anchorClipId: focusClipId, focusClipId };
}

export function selectClipsInRange(project: VoiceStudioProject, selection: VoiceStudioSelectionState, direction: -1 | 1): VoiceStudioSelectionState {
  const ids = allClipIds(project);
  if (!ids.length) return deselectAllClips();
  const currentIndex = Math.max(0, selection.focusClipId ? ids.indexOf(selection.focusClipId) : -1);
  const nextIndex = Math.min(ids.length - 1, Math.max(0, currentIndex + direction));
  const focusClipId = ids[nextIndex];
  const anchorClipId = selection.anchorClipId ?? selection.focusClipId ?? focusClipId;
  return { clipIds: new Set(rangeIds(project, anchorClipId, focusClipId)), anchorClipId, focusClipId };
}

export function moveFocus(project: VoiceStudioProject, selection: VoiceStudioSelectionState, direction: -1 | 1, extend: boolean): VoiceStudioSelectionState {
  const ids = allClipIds(project);
  if (!ids.length) return deselectAllClips();
  if (extend) return selectClipsInRange(project, selection, direction);
  const currentIndex = selection.focusClipId ? ids.indexOf(selection.focusClipId) : -1;
  const nextIndex = Math.min(ids.length - 1, Math.max(0, currentIndex < 0 ? 0 : currentIndex + direction));
  return createSelectionState([ids[nextIndex]], ids[nextIndex]);
}

export function selectClipsByRect(project: VoiceStudioProject, rect: VoiceStudioSelectionRect, trackHeight: number, timeFromPixels: (pixels: number) => number): VoiceStudioSelectionState {
  const topTrack = Math.max(0, Math.floor(rect.top / trackHeight));
  const bottomTrack = Math.max(0, Math.floor(Math.max(rect.top, rect.bottom - 1) / trackHeight));
  const start = timeFromPixels(rect.left);
  const end = timeFromPixels(rect.right);
  const clipIds: string[] = [];
  project.tracks.forEach((track, trackIndex) => {
    if (trackIndex < topTrack || trackIndex > bottomTrack) return;
    track.clips.forEach(clip => {
      if (clip.start < end && clip.start + clip.duration > start) clipIds.push(clip.id);
    });
  });
  return createSelectionState(clipIds);
}
