import { describe, expect, it } from 'vitest';

import {
  createSelectionState,
  deselectAllClips,
  moveFocus,
  reconcileSelection,
  selectAllClips,
  selectClipById,
  selectClipsByRect,
  selectedClipLocations,
} from './voice-studio-selection-engine';
import {
  addAssetClipToProject,
  createTrackContainer,
  createVoiceStudioProject,
  deleteClip,
  type VoiceStudioAsset,
  type VoiceStudioProject,
} from './voice-studio-project-model';

function asset(id: string): VoiceStudioAsset {
  return { id, kind: 'audio', duration: 2, createdAt: '2026-01-01T00:00:00.000Z', peaks: [], midiNotes: [] };
}

function selectionProject(): VoiceStudioProject {
  const base = createVoiceStudioProject();
  const first = createTrackContainer({ kind: 'audio', name: 'One' });
  const second = createTrackContainer({ kind: 'audio', name: 'Two', index: 1 });
  let project = { ...base, tracks: [first, second] };
  project = addAssetClipToProject(project, asset('a1'), 'A', 0, first.id);
  project = addAssetClipToProject(project, asset('a2'), 'B', 3, first.id);
  project = addAssetClipToProject(project, asset('a3'), 'C', 1, second.id);
  return project;
}

function ids(project: VoiceStudioProject): string[] {
  return project.tracks.flatMap(track => track.clips.map(clip => clip.id));
}

describe('voice-studio-selection-engine', () => {
  it('creates and clears empty selection', () => {
    expect(createSelectionState()).toEqual(deselectAllClips());
    expect(createSelectionState().clipIds.size).toBe(0);
  });

  it('selects one clip and replaces the previous selection', () => {
    const project = selectionProject();
    const [first, second] = ids(project);
    const initial = createSelectionState([first]);
    const result = selectClipById(project, initial, second, 'replace');

    expect(Array.from(result.clipIds)).toEqual([second]);
    expect(result.focusClipId).toBe(second);
  });

  it('adds, toggles and range-selects clips', () => {
    const project = selectionProject();
    const [first, second, third] = ids(project);
    const added = selectClipById(project, createSelectionState([first]), second, 'add');
    expect(added.clipIds).toEqual(new Set([first, second]));

    const toggled = selectClipById(project, added, first, 'toggle');
    expect(toggled.clipIds).toEqual(new Set([second]));

    const ranged = selectClipById(project, createSelectionState([first], first), third, 'range');
    expect(ranged.clipIds).toEqual(new Set([first, second, third]));
  });

  it('selects all clips', () => {
    const project = selectionProject();
    expect(selectAllClips(project).clipIds).toEqual(new Set(ids(project)));
  });

  it('selects intersecting clips by rectangle and track range', () => {
    const project = selectionProject();
    const result = selectClipsByRect(
      project,
      { left: 0, right: 2.5, top: 0, bottom: 150 },
      74,
      pixels => pixels,
    );

    expect(result.clipIds.size).toBe(2);
    expect(Array.from(result.clipIds)).toEqual([project.tracks[0].clips[0].id, project.tracks[1].clips[0].id]);
  });

  it('moves focus with and without extending selection', () => {
    const project = selectionProject();
    const [first, second] = ids(project);
    const moved = moveFocus(project, createSelectionState([first], first), 1, false);
    expect(Array.from(moved.clipIds)).toEqual([second]);

    const extended = moveFocus(project, createSelectionState([first], first), 1, true);
    expect(extended.clipIds).toEqual(new Set([first, second]));
  });

  it('reconciles selection after clip deletion', () => {
    const project = selectionProject();
    const [first, second] = ids(project);
    const reduced = deleteClip(project, first);
    const reconciled = reconcileSelection(reduced, createSelectionState([first, second], first));

    expect(reconciled.clipIds).toEqual(new Set([second]));
    expect(reconciled.focusClipId).toBe(second);
  });

  it('returns selected locations and ignores missing ids', () => {
    const project = selectionProject();
    const [first] = ids(project);
    const selection = createSelectionState([first, 'missing']);
    const locations = selectedClipLocations(project, selection);

    expect(locations).toHaveLength(1);
    expect(locations[0].clip.id).toBe(first);
  });

  it('keeps selection stable when selecting an unknown id', () => {
    const project = selectionProject();
    const [first] = ids(project);
    const selection = createSelectionState([first], first);
    expect(selectClipById(project, selection, 'missing', 'replace')).toBe(selection);
  });
});
