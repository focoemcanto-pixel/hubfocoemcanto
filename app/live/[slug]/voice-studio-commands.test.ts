import { describe, expect, it } from 'vitest';
import {
  DeleteClipCommand,
  DuplicateClipCommand,
  MoveClipCommand,
  SplitClipCommand,
  TrimClipCommand,
  type VoiceStudioCommand,
} from './voice-studio-commands';
import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import {
  addAssetClipToProject,
  createTrackContainer,
  createVoiceStudioProject,
  findClip,
  type VoiceStudioAsset,
  type VoiceStudioProject,
} from './voice-studio-project-model';

type Fixture = { project: VoiceStudioProject; clipId: string; trackId: string; secondTrackId: string };

function projectWithClip(): Fixture {
  const asset: VoiceStudioAsset = {
    id: 'asset-a',
    kind: 'audio',
    duration: 12,
    createdAt: '2026-07-19T00:00:00.000Z',
    peaks: [0.1, 0.4],
    midiNotes: [],
  };
  let project = createVoiceStudioProject('Commands');
  const track = createTrackContainer({ kind: 'audio', name: 'Voz 1' });
  const secondTrack = createTrackContainer({ kind: 'audio', name: 'Voz 2' });
  project = { ...project, tracks: [track, secondTrack] };
  project = addAssetClipToProject(project, asset, 'Take 1', 1, track.id);
  return {
    project,
    clipId: project.tracks[0].clips[0].id,
    trackId: track.id,
    secondTrackId: secondTrack.id,
  };
}

function roundTrip(fixture: Fixture, command: VoiceStudioCommand) {
  const history = new VoiceStudioHistoryEngine();
  const changed = history.execute(fixture.project, command);
  const undone = history.undo(changed)!;
  const redone = history.redo(undone)!;
  return { history, changed, undone, redone };
}

describe('Voice Studio clip Commands', () => {
  it('moves a clip and preserves undo/redo', () => {
    const fixture = projectWithClip();
    const result = roundTrip(fixture, new MoveClipCommand(fixture.clipId, fixture.secondTrackId, 5));
    expect(findClip(result.changed, fixture.clipId)).toMatchObject({ trackId: fixture.secondTrackId, clip: { start: 5 } });
    expect(findClip(result.undone, fixture.clipId)).toMatchObject({ trackId: fixture.trackId, clip: { start: 1 } });
    expect(findClip(result.redone, fixture.clipId)).toMatchObject({ trackId: fixture.secondTrackId, clip: { start: 5 } });
  });

  it('splits a clip and restores the original clip on undo', () => {
    const fixture = projectWithClip();
    const result = roundTrip(fixture, new SplitClipCommand(fixture.clipId, 5));
    expect(result.changed.tracks[0].clips).toHaveLength(2);
    expect(result.undone.tracks[0].clips).toHaveLength(1);
    expect(result.undone.tracks[0].clips[0].id).toBe(fixture.clipId);
    expect(result.redone.tracks[0].clips).toHaveLength(2);
  });

  it('deletes and restores a clip', () => {
    const fixture = projectWithClip();
    const result = roundTrip(fixture, new DeleteClipCommand(fixture.clipId));
    expect(findClip(result.changed, fixture.clipId)).toBeNull();
    expect(findClip(result.undone, fixture.clipId)).not.toBeNull();
    expect(findClip(result.redone, fixture.clipId)).toBeNull();
  });

  it('duplicates a clip without generating a new duplicate during redo', () => {
    const fixture = projectWithClip();
    const result = roundTrip(fixture, new DuplicateClipCommand(fixture.clipId, 7, fixture.secondTrackId));
    expect(result.changed.tracks[1].clips).toHaveLength(1);
    expect(result.undone.tracks[1].clips).toHaveLength(0);
    expect(result.redone.tracks[1].clips).toHaveLength(1);
    expect(result.redone.tracks[1].clips[0].id).toBe(result.changed.tracks[1].clips[0].id);
  });

  it('trims either edge and restores exact clip geometry', () => {
    const fixture = projectWithClip();
    const result = roundTrip(fixture, new TrimClipCommand(fixture.clipId, 'start', 3));
    expect(findClip(result.changed, fixture.clipId)?.clip).toMatchObject({ start: 3, sourceOffset: 2, duration: 10 });
    expect(findClip(result.undone, fixture.clipId)?.clip).toMatchObject({ start: 1, sourceOffset: 0, duration: 12 });
    expect(findClip(result.redone, fixture.clipId)?.clip).toMatchObject({ start: 3, sourceOffset: 2, duration: 10 });
  });

  it('stores only Commands and merges consecutive move commands', () => {
    const fixture = projectWithClip();
    const history = new VoiceStudioHistoryEngine();
    const first = history.execute(fixture.project, new MoveClipCommand(fixture.clipId, fixture.trackId, 2));
    const second = history.execute(first, new MoveClipCommand(fixture.clipId, fixture.trackId, 4), { merge: true });

    expect(history.historyStack).toHaveLength(1);
    expect(history.historyStack[0]).toBeInstanceOf(MoveClipCommand);
    expect('project' in history.historyStack[0]).toBe(false);
    expect(findClip(second, fixture.clipId)?.clip.start).toBe(4);
    expect(findClip(history.undo(second)!, fixture.clipId)?.clip.start).toBe(1);
  });
});
