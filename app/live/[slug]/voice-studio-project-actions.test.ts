import { describe, expect, it } from 'vitest';
import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import { createVoiceStudioProjectActions } from './voice-studio-project-actions';
import {
  addAssetClipToProject,
  createTrackContainer,
  createVoiceStudioProject,
  findClip,
  type VoiceStudioAsset,
  type VoiceStudioProject,
} from './voice-studio-project-model';

function fixture(): { project: VoiceStudioProject; clipId: string; firstTrackId: string; secondTrackId: string } {
  const asset: VoiceStudioAsset = {
    id: 'asset-actions',
    kind: 'audio',
    duration: 12,
    createdAt: '2026-07-19T00:00:00.000Z',
    peaks: [0.1, 0.5],
    midiNotes: [],
  };
  let project = createVoiceStudioProject('Actions');
  const firstTrack = createTrackContainer({ kind: 'audio', name: 'Voz principal' });
  const secondTrack = createTrackContainer({ kind: 'audio', name: 'Dobras' });
  project = { ...project, tracks: [firstTrack, secondTrack] };
  project = addAssetClipToProject(project, asset, 'Take 1', 1, firstTrack.id);
  return {
    project,
    clipId: project.tracks[0].clips[0].id,
    firstTrackId: firstTrack.id,
    secondTrackId: secondTrack.id,
  };
}

describe('VoiceStudioProjectActions', () => {
  it('routes clip mutations through Commands and History', () => {
    const { project, clipId, firstTrackId, secondTrackId } = fixture();
    const history = new VoiceStudioHistoryEngine();
    const actions = createVoiceStudioProjectActions(project, history);

    actions.moveClip(clipId, secondTrackId, 4);
    expect(findClip(project, clipId)).toMatchObject({ trackId: secondTrackId, clip: { start: 4 } });

    actions.trim(clipId, 'start', 5);
    expect(findClip(project, clipId)?.clip).toMatchObject({ start: 5, sourceOffset: 1, duration: 11 });

    actions.fade(clipId, { fadeIn: 1, fadeOut: 2 });
    expect(findClip(project, clipId)?.clip).toMatchObject({ fadeIn: 1, fadeOut: 2 });

    actions.duplicate(clipId, 8, firstTrackId);
    expect(project.tracks.find(track => track.id === firstTrackId)?.clips).toHaveLength(1);

    actions.delete(clipId);
    expect(findClip(project, clipId)).toBeNull();
    expect(history.historyStack.every(command => !('project' in command))).toBe(true);
  });

  it('preserves undo and redo through the Actions facade', () => {
    const { project, clipId, secondTrackId } = fixture();
    const actions = createVoiceStudioProjectActions(project, new VoiceStudioHistoryEngine());

    actions.moveClip(clipId, secondTrackId, 6);
    expect(findClip(project, clipId)?.clip.start).toBe(6);

    actions.undo();
    expect(findClip(project, clipId)?.clip.start).toBe(1);

    actions.redo();
    expect(findClip(project, clipId)?.clip.start).toBe(6);
  });

  it('supports split, track actions and normalization without replacing the shared project reference', () => {
    const { project, clipId, firstTrackId, secondTrackId } = fixture();
    const actions = createVoiceStudioProjectActions(project, new VoiceStudioHistoryEngine());
    const reference = actions.project;

    actions.renameTrack(firstTrackId, 'Lead');
    expect(project.tracks[0].name).toBe('Lead');

    actions.moveTrack(secondTrackId, 0);
    expect(project.tracks[0].id).toBe(secondTrackId);

    actions.splitClip(clipId, 5);
    expect(project.tracks.find(track => track.id === firstTrackId)?.clips).toHaveLength(2);

    project.schemaVersion = 1 as 2;
    actions.normalize();
    expect(project.schemaVersion).toBe(2);
    expect(actions.project).toBe(reference);
  });

  it('merges continuous fade gestures into a single history command', () => {
    const { project, clipId } = fixture();
    const history = new VoiceStudioHistoryEngine();
    const actions = createVoiceStudioProjectActions(project, history);

    actions.fade(clipId, { fadeIn: 0.5 }, { groupId: 'fade-drag', merge: true });
    actions.fade(clipId, { fadeIn: 1.5 }, { groupId: 'fade-drag', merge: true });

    expect(history.historyStack).toHaveLength(1);
    expect(findClip(project, clipId)?.clip.fadeIn).toBe(1.5);
    actions.undo();
    expect(findClip(project, clipId)?.clip.fadeIn).toBe(0);
  });
});
