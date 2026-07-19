import { describe, expect, it } from 'vitest';

import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import { createVoiceStudioProject, type VoiceStudioProject } from './voice-studio-project-model';

function named(project: VoiceStudioProject, name: string): VoiceStudioProject {
  return { ...project, name, updatedAt: `${name}-updated` };
}

describe('VoiceStudioHistoryEngine', () => {
  it('starts empty and respects the configured minimum limit', () => {
    const engine = new VoiceStudioHistoryEngine(0);
    expect(engine.canUndo).toBe(false);
    expect(engine.canRedo).toBe(false);
    expect(engine.limit).toBe(1);
    expect(engine.snapshot()).toMatchObject({ history: [], future: [] });
  });

  it('commits, undoes and redoes snapshots', () => {
    const initial = createVoiceStudioProject('initial');
    const changed = named(initial, 'changed');
    const engine = new VoiceStudioHistoryEngine();

    expect(engine.commit(initial, changed, { operation: 'project' })).toBe(true);
    expect(engine.canUndo).toBe(true);

    const undone = engine.undo(changed);
    expect(undone?.name).toBe('initial');
    expect(engine.canRedo).toBe(true);

    const redone = engine.redo(undone!);
    expect(redone?.name).toBe('changed');
  });

  it('ignores commits with equivalent normalized projects', () => {
    const project = createVoiceStudioProject();
    const engine = new VoiceStudioHistoryEngine();
    expect(engine.commit(project, structuredClone(project), { operation: 'project' })).toBe(false);
    expect(engine.canUndo).toBe(false);
  });

  it('clears future after a new commit', () => {
    const initial = createVoiceStudioProject('initial');
    const first = named(initial, 'first');
    const second = named(first, 'second');
    const alternate = named(initial, 'alternate');
    const engine = new VoiceStudioHistoryEngine();

    engine.commit(initial, first, { operation: 'project' });
    engine.commit(first, second, { operation: 'project' });
    const undone = engine.undo(second)!;
    expect(engine.canRedo).toBe(true);

    engine.commit(undone, alternate, { operation: 'project' });
    expect(engine.canRedo).toBe(false);
  });

  it('enforces history limit and can reconfigure it', () => {
    const engine = new VoiceStudioHistoryEngine(2);
    const base = createVoiceStudioProject('0');
    const one = named(base, '1');
    const two = named(one, '2');
    const three = named(two, '3');

    engine.commit(base, one, { operation: 'project' });
    engine.commit(one, two, { operation: 'project' });
    engine.commit(two, three, { operation: 'project' });
    expect(engine.historyStack).toHaveLength(2);

    engine.configure(1);
    expect(engine.historyStack).toHaveLength(1);
    expect(engine.limit).toBe(1);
  });

  it('resets both stacks', () => {
    const initial = createVoiceStudioProject('initial');
    const changed = named(initial, 'changed');
    const engine = new VoiceStudioHistoryEngine();

    engine.commit(initial, changed, { operation: 'project' });
    engine.undo(changed);
    engine.reset();

    expect(engine.canUndo).toBe(false);
    expect(engine.canRedo).toBe(false);
  });

  it('merges consecutive operations with matching group ids', () => {
    const initial = createVoiceStudioProject('initial');
    const first = named(initial, 'first');
    const second = named(first, 'second');
    const engine = new VoiceStudioHistoryEngine();

    engine.commit(initial, first, { operation: 'gain', groupId: 'track-1' });
    engine.commit(first, second, { operation: 'gain', groupId: 'track-1', merge: true });

    expect(engine.historyStack).toHaveLength(1);
    expect(engine.undo(second)?.name).toBe('initial');
  });

  it('prevents later mutations from corrupting stored snapshots', () => {
    const initial = createVoiceStudioProject('initial');
    const changed = named(initial, 'changed');
    const engine = new VoiceStudioHistoryEngine();

    engine.commit(initial, changed, { operation: 'project' });
    initial.name = 'mutated-after-commit';
    changed.name = 'also-mutated';

    const restored = engine.undo(changed)!;
    expect(restored.name).toBe('initial');
    restored.name = 'mutated-restored';
    expect(engine.futureStack[0].project.name).toBe('also-mutated');
  });
});
