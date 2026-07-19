import { commandChangedProject, type VoiceStudioCommand } from './voice-studio-commands';
import type { VoiceStudioProject } from './voice-studio-project-model';

export type VoiceStudioHistoryState = {
  history: VoiceStudioCommand[];
  future: VoiceStudioCommand[];
  limit: number;
};

const DEFAULT_HISTORY_LIMIT = 50;

export class VoiceStudioHistoryEngine {
  private state: VoiceStudioHistoryState;

  constructor(limit = DEFAULT_HISTORY_LIMIT) {
    this.state = { history: [], future: [], limit: Math.max(1, limit) };
  }

  get canUndo() { return this.state.history.length > 0; }
  get canRedo() { return this.state.future.length > 0; }
  get historyStack() { return this.state.history; }
  get futureStack() { return this.state.future; }
  get limit() { return this.state.limit; }

  configure(limit: number): void {
    this.state.limit = Math.max(1, limit);
    this.state.history = this.state.history.slice(-this.state.limit);
    this.state.future = this.state.future.slice(0, this.state.limit);
  }

  reset(): void {
    this.state = { ...this.state, history: [], future: [] };
  }

  execute(project: VoiceStudioProject, command: VoiceStudioCommand, options: { merge?: boolean } = {}): VoiceStudioProject {
    const previous = this.state.history.at(-1);
    if (options.merge && previous?.canMergeWith?.(command) && previous.mergeWith) {
      const withoutPrevious = previous.undo(project);
      const merged = previous.mergeWith(command);
      const next = merged.execute(withoutPrevious);
      if (!commandChangedProject(withoutPrevious, next)) return project;
      this.state = {
        ...this.state,
        history: [...this.state.history.slice(0, -1), merged],
        future: [],
      };
      return next;
    }

    const next = command.execute(project);
    if (!commandChangedProject(project, next)) return project;
    this.state = {
      ...this.state,
      history: [...this.state.history, command].slice(-this.state.limit),
      future: [],
    };
    return next;
  }

  undo(project: VoiceStudioProject): VoiceStudioProject | null {
    const command = this.state.history.at(-1);
    if (!command) return null;
    const next = command.undo(project);
    this.state = {
      ...this.state,
      history: this.state.history.slice(0, -1),
      future: [command, ...this.state.future].slice(0, this.state.limit),
    };
    return next;
  }

  redo(project: VoiceStudioProject): VoiceStudioProject | null {
    const command = this.state.future[0];
    if (!command) return null;
    const next = command.execute(project);
    this.state = {
      ...this.state,
      history: [...this.state.history, command].slice(-this.state.limit),
      future: this.state.future.slice(1),
    };
    return next;
  }

  snapshot(): VoiceStudioHistoryState {
    return { ...this.state, history: [...this.state.history], future: [...this.state.future] };
  }
}
