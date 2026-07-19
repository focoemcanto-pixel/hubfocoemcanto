import { describe, expect, it } from 'vitest';
import { MoveClipCommand } from './voice-studio-commands';
import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import {
  addAssetClipToProject,
  createTrackContainer,
  createVoiceStudioProject,
  findClip,
  type VoiceStudioAsset,
  type VoiceStudioProject,
} from './voice-studio-project-model';

function named(project: VoiceStudioProject, name: string): VoiceStudioProject {
  return { ...project, name, updatedAt: `${name}-updated` };
}

function movableProject() {
  const asset: VoiceStudioAsset = {
    id: 'asset-history', kind: 'audio', duration: 10, createdAt: '', peaks: [], midiNotes: [],
  };
  let project = createVoiceStudioProject('history');
  const track = createTrackContainer({ kind: 'audio', name: 'Voz' });
  project = { ...project, tracks: [track] };
  project = addAssetClipToProject(project, asset, 'Take', 0, track.id);
  return { project, trackId: track.id, clipId: project.tracks[0].clips[0].id };
}

describe('VoiceStudioHistoryEngine', () => {
  it('starts empty and respects the configured minimum limit', () => {
    const engine = new VoiceStudioHistoryEngine(0);
    expect(engine.canUndo).toBe(false);
    expect(engine.canRedo).toBe(false);
    expect(engine.limit).toBe(1);
    expect(engine.snapshot()).toMatchObject({ history: [], future: [] });
  });

  it('executes, undoes and redoes Commands', () => {
    const fixture = movableProject();
    const engine = new VoiceStudioHistoryEngine();
    const changed = engine.execute(fixture.project, new MoveClipCommand(fixture.clipId, fixture.trackId, 4));
    expect(findClip(changed, fixture.clipId)?.clip.start).toBe(4);
    const undone = engine.undo(changed)!;
    expect(findClip(undone, fixture.clipId)?.clip.start).toBe(0);
    const redone = engine.redo(undone)!;
    expect(findClip(redone, fixture.clipId)?.clip.start).toBe(4);
  });

  it('keeps the legacy commit API as a Command adapter', () => {
    const initial = createVoiceStudioProject('initial');
    const changed = named(initial, 'changed');
    const engine = new VoiceStudioHistoryEngine();
    expect(engine.commit(initial, changed, { operation: 'project' })).toBe(true);
    expect(engine.historyStack).toHaveLength(1);
    expect('project' in engine.historyStack[0]).toBe(false);
    expect(engine.undo(changed)?.name).toBe('initial');
    expect(engine.redo(initial)?.name).toBe('changed');
  });

  it('ignores equivalent legacy commits', () => {
    const project = createVoiceStudioProject();
    const engine = new VoiceStudioHistoryEngine();
    expect(engine.commit(project, structuredClone(project), { operation: 'project' })).toBe(false);
    expect(engine.canUndo).toBe(false);
  });

  it('clears future after a new Command', () => {
    const fixture = movableProject();
    const engine = new VoiceStudioHistoryEngine();
    const first = engine.execute(fixture.project, new MoveClipCommand(fixture.clipId, fixture.trackId, 2));
    const second = engine.execute(first, new MoveClipCommand(fixture.clipId, fixture.trackId, 4));
    const undone = engine.undo(second)!;
    expect(engine.canRedo).toBe(true);
    engine.execute(undone, new MoveClipCommand(fixture.clipId, fixture.trackId, 6));
    expect(engine.canRedo).toBe(false);
  });

  it('enforces history limit and can reconfigure it', () => {
    const fixture = movableProject();
    const engine = new VoiceStudioHistoryEngine(2);
    let project = fixture.project;
    project = engine.execute(project, new MoveClipCommand(fixture.clipId, fixture.trackId, 1));
    project = engine.execute(project, new MoveClipCommand(fixture.clipId, fixture.trackId, 2));
    project = engine.execute(project, new MoveClipCommand(fixture.clipId, fixture.trackId, 3));
    expect(engine.historyStack).toHaveLength(2);
    engine.configure(1);
    expect(engine.historyStack).toHaveLength(1);
    expect(engine.limit).toBe(1);
  });

  it('resets both stacks', () => {
    const fixture = movableProject();
    const engine = new VoiceStudioHistoryEngine();
    const changed = engine.execute(fixture.project, new MoveClipCommand(fixture.clipId, fixture.trackId, 2));
    engine.undo(changed);
    engine.reset();
    expect(engine.canUndo).toBe(false);
    expect(engine.canRedo).toBe(false);
  });

  it('merges consecutive compatible Commands', () => {
    const fixture = movableProject();
    const engine = new VoiceStudioHistoryEngine();
    const first = engine.execute(fixture.project, new MoveClipCommand(fixture.clipId, fixture.trackId, 1));
    const second = engine.execute(first, new MoveClipCommand(fixture.clipId, fixture.trackId, 5), { merge: true });
    expect(engine.historyStack).toHaveLength(1);
    expect(findClip(engine.undo(second)!, fixture.clipId)?.clip.start).toBe(0);
  });
});
