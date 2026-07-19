import { describe, expect, it } from 'vitest';

import { playbackSelectionRange } from './voice-studio-playback-engine';
import {
  addAssetClipToProject,
  createTrackContainer,
  createVoiceStudioProject,
  type VoiceStudioAsset,
} from './voice-studio-project-model';

function asset(id: string, duration: number): VoiceStudioAsset {
  return { id, kind: 'audio', duration, createdAt: '2026-01-01T00:00:00.000Z', peaks: [], midiNotes: [] };
}

describe('playbackSelectionRange', () => {
  it('returns null for an empty or unknown selection', () => {
    const project = createVoiceStudioProject();
    expect(playbackSelectionRange(project, [])).toBeNull();
    expect(playbackSelectionRange(project, ['missing'])).toBeNull();
  });

  it('returns the exact range of one selected clip', () => {
    const base = createVoiceStudioProject();
    const track = createTrackContainer({ kind: 'audio', name: 'Lead' });
    const project = addAssetClipToProject({ ...base, tracks: [track] }, asset('a1', 3), 'One', 2, track.id);
    const clip = project.tracks[0].clips[0];

    expect(playbackSelectionRange(project, [clip.id])).toEqual({ start: 2, end: 5 });
  });

  it('spans the earliest start and latest end across tracks', () => {
    const base = createVoiceStudioProject();
    const first = createTrackContainer({ kind: 'audio', name: 'One' });
    const second = createTrackContainer({ kind: 'audio', name: 'Two', index: 1 });
    let project = { ...base, tracks: [first, second] };
    project = addAssetClipToProject(project, asset('a1', 2), 'A', 5, first.id);
    project = addAssetClipToProject(project, asset('a2', 4), 'B', 1, second.id);
    const selected = project.tracks.flatMap(track => track.clips.map(clip => clip.id));

    expect(playbackSelectionRange(project, selected)).toEqual({ start: 1, end: 7 });
  });

  it('ignores unselected clips', () => {
    const base = createVoiceStudioProject();
    const track = createTrackContainer({ kind: 'audio', name: 'Lead' });
    let project = { ...base, tracks: [track] };
    project = addAssetClipToProject(project, asset('a1', 2), 'A', 0, track.id);
    project = addAssetClipToProject(project, asset('a2', 3), 'B', 10, track.id);

    expect(playbackSelectionRange(project, [project.tracks[0].clips[0].id])).toEqual({ start: 0, end: 2 });
  });
});
