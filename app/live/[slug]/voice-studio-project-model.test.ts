import { describe, expect, it } from 'vitest';

import {
  addAssetClipToProject,
  copyClip,
  createClipFromAsset,
  createTrackContainer,
  createVoiceStudioProject,
  deleteClip,
  duplicateClip,
  findClip,
  moveClip,
  normalizeVoiceStudioProject,
  pasteClip,
  projectDuration,
  splitClip,
  trimClipEnd,
  trimClipStart,
  updateClipFade,
  type VoiceStudioAsset,
  type VoiceStudioProject,
} from './voice-studio-project-model';

function audioAsset(overrides: Partial<VoiceStudioAsset> = {}): VoiceStudioAsset {
  return {
    id: 'asset-1',
    kind: 'audio',
    fileName: 'voice.webm',
    mimeType: 'audio/webm',
    duration: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    peaks: [0.1, 0.5],
    midiNotes: [],
    ...overrides,
  };
}

function projectWithClip(): { project: VoiceStudioProject; clipId: string; trackId: string } {
  const base = createVoiceStudioProject('Teste');
  const track = createTrackContainer({ kind: 'audio', name: 'Voz', index: 0 });
  const project = addAssetClipToProject({ ...base, tracks: [track] }, audioAsset(), 'Clip', 2, track.id);
  return { project, trackId: track.id, clipId: project.tracks[0].clips[0].id };
}

describe('voice-studio-project-model', () => {
  it('creates the initial project with stable defaults and unique ids', () => {
    const first = createVoiceStudioProject();
    const second = createVoiceStudioProject();

    expect(first.schemaVersion).toBe(2);
    expect(first.tempo).toBe(90);
    expect(first.tracks).toEqual([]);
    expect(first.assets).toEqual({});
    expect(first.id).not.toBe(second.id);
  });

  it('normalizes missing collections and invalid clip values without mutating input', () => {
    const { project, clipId } = projectWithClip();
    const input = structuredClone(project);
    const clip = input.tracks[0].clips[0];
    clip.start = -2;
    clip.duration = -1;
    clip.fadeIn = 9;
    clip.fadeOut = 9;
    input.tracks[0].pan = Number.NaN;

    const normalized = normalizeVoiceStudioProject(input);

    expect(findClip(normalized, clipId)?.clip.start).toBe(0);
    expect(findClip(normalized, clipId)?.clip.duration).toBe(0.08);
    expect(normalized.tracks[0].pan).toBe(0);
    expect(input.tracks[0].clips[0].start).toBe(-2);
  });

  it('creates tracks and clips with current invariants', () => {
    const track = createTrackContainer({ kind: 'midi', name: 'Keys', instrument: 'piano', index: 2 });
    const clip = createClipFromAsset({ asset: audioAsset(), start: -4, sourceOffset: 3, duration: 99 });

    expect(track.id).toBeTruthy();
    expect(track.clips).toEqual([]);
    expect(track.volume).toBe(1);
    expect(clip.start).toBe(0);
    expect(clip.sourceOffset).toBe(3);
    expect(clip.duration).toBe(7);
  });

  it('adds an asset and clip immutably to a compatible track', () => {
    const base = createVoiceStudioProject();
    const track = createTrackContainer({ kind: 'audio', name: 'Voz' });
    const input = { ...base, tracks: [track] };
    const result = addAssetClipToProject(input, audioAsset(), 'Lead', 1.5, track.id);

    expect(input.assets).toEqual({});
    expect(input.tracks[0].clips).toEqual([]);
    expect(result.assets['asset-1']).toBeDefined();
    expect(result.tracks[0].clips[0]).toMatchObject({ name: 'Lead', start: 1.5, duration: 10 });
  });

  it('copies, pastes and duplicates clips with new ids', () => {
    const { project, clipId, trackId } = projectWithClip();
    const clipboard = copyClip(project, clipId);
    expect(clipboard).not.toBeNull();

    const pasted = pasteClip(project, clipboard!, 5, trackId);
    const duplicated = duplicateClip(project, clipId, 7, trackId);

    expect(pasted.tracks[0].clips).toHaveLength(2);
    expect(duplicated.tracks[0].clips).toHaveLength(2);
    expect(pasted.tracks[0].clips[1].id).not.toBe(clipId);
    expect(duplicated.tracks[0].clips[1].id).not.toBe(clipId);
    expect(project.tracks[0].clips).toHaveLength(1);
  });

  it('moves clips between compatible tracks and clamps negative start', () => {
    const { project, clipId } = projectWithClip();
    const target = createTrackContainer({ kind: 'audio', name: 'Backing', index: 1 });
    const input = { ...project, tracks: [...project.tracks, target] };
    const moved = moveClip(input, clipId, target.id, -3);

    expect(moved.tracks[0].clips).toHaveLength(0);
    expect(moved.tracks[1].clips[0].start).toBe(0);
    expect(input.tracks[0].clips).toHaveLength(1);
  });

  it('deletes clips immutably', () => {
    const { project, clipId } = projectWithClip();
    const result = deleteClip(project, clipId);

    expect(result.tracks[0].clips).toHaveLength(0);
    expect(project.tracks[0].clips).toHaveLength(1);
  });

  it('splits a clip at the playhead preserving total duration and source offset', () => {
    const { project, clipId } = projectWithClip();
    const result = splitClip(project, clipId, 6);
    const [left, right] = result.tracks[0].clips;

    expect(result.tracks[0].clips).toHaveLength(2);
    expect(left.duration + right.duration).toBe(10);
    expect(right.start).toBe(6);
    expect(right.sourceOffset).toBe(4);
    expect(left.id).not.toBe(right.id);
  });

  it('does not split at invalid boundaries', () => {
    const { project, clipId } = projectWithClip();
    expect(splitClip(project, clipId, 2.01)).toBe(project);
    expect(splitClip(project, clipId, 11.99)).toBe(project);
  });

  it('trims start and end while respecting minimum duration and source bounds', () => {
    const { project, clipId } = projectWithClip();
    const startTrimmed = trimClipStart(project, clipId, 4);
    const startClip = findClip(startTrimmed, clipId)!.clip;
    expect(startClip.start).toBe(4);
    expect(startClip.sourceOffset).toBe(2);
    expect(startClip.duration).toBe(8);

    const endTrimmed = trimClipEnd(project, clipId, 8);
    expect(findClip(endTrimmed, clipId)!.clip.duration).toBe(6);
  });

  it('clamps fades so their sum never exceeds clip duration', () => {
    const { project, clipId } = projectWithClip();
    const result = updateClipFade(project, clipId, { fadeIn: 8, fadeOut: 8 });
    const clip = findClip(result, clipId)!.clip;

    expect(clip.fadeIn + clip.fadeOut).toBeLessThanOrEqual(clip.duration);
    expect(project.tracks[0].clips[0].fadeIn).toBe(0);
  });

  it('calculates project duration with the current minimum canvas duration', () => {
    expect(projectDuration(createVoiceStudioProject())).toBe(8);
    const { project } = projectWithClip();
    expect(projectDuration(project)).toBe(12);
  });

  it('returns null or original project for missing ids', () => {
    const project = createVoiceStudioProject();
    expect(findClip(project, 'missing')).toBeNull();
    expect(copyClip(project, 'missing')).toBeNull();
    expect(deleteClip(project, 'missing')).toBe(project);
  });
});
