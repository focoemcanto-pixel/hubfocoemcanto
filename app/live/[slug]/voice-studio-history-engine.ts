import { cloneVoiceStudioProject, normalizeVoiceStudioProject, type VoiceStudioProject } from './voice-studio-project-model';
import { commandChangedProject, type VoiceStudioCommand, type VoiceStudioCommandKind } from './voice-studio-commands';

export type VoiceStudioHistoryOperation =
  | 'move'
  | 'split'
  | 'trim'
  | 'delete'
  | 'duplicate'
  | 'paste'
  | 'import'
  | 'recording'
  | 'track-rename'
  | 'track-color'
  | 'mute'
  | 'solo'
  | 'gain'
  | 'fade'
  | 'loop'
  | 'marker'
  | 'project';

export type VoiceStudioHistoryCommitOptions = {
  operation: VoiceStudioHistoryOperation;
  label?: string;
  groupId?: string;
  merge?: boolean;
};

export type VoiceStudioHistoryState = {
  history: VoiceStudioCommand[];
  future: VoiceStudioCommand[];
  limit: number;
};

const DEFAULT_HISTORY_LIMIT = 50;

class AppliedProjectCommand implements VoiceStudioCommand {
  readonly id = crypto.randomUUID();
  readonly kind: VoiceStudioCommandKind = 'project-mutation';
  readonly createdAt = new Date().toISOString();
  readonly label: string;
  readonly groupId?: string;
  readonly operation: VoiceStudioHistoryOperation;
  readonly #before: VoiceStudioProject;
  readonly #after: VoiceStudioProject;

  constructor(before: VoiceStudioProject, after: VoiceStudioProject, options: VoiceStudioHistoryCommitOptions) {
    this.#before = cloneVoiceStudioProject(before);
    this.#after = cloneVoiceStudioProject(after);
    this.operation = options.operation;
    this.label = options.label ?? options.operation;
    this.groupId = options.groupId;
  }

  execute(): VoiceStudioProject {
    return cloneVoiceStudioProject(this.#after);
  }

  undo(): VoiceStudioProject {
    return cloneVoiceStudioProject(this.#before);
  }

  canMergeWith(command: VoiceStudioCommand): boolean {
    return command instanceof AppliedProjectCommand
      && command.operation === this.operation
      && Boolean(this.groupId)
      && command.groupId === this.groupId;
  }

  mergeWith(command: VoiceStudioCommand): VoiceStudioCommand {
    if (!(command instanceof AppliedProjectCommand) || !this.canMergeWith(command)) return command;
    return new AppliedProjectCommand(this.#before, command.#after, {
      operation: this.operation,
      label: command.label,
      groupId: this.groupId,
    });
  }
}

function equivalent(left: VoiceStudioProject, right: VoiceStudioProject): boolean {
  return JSON.stringify(normalizeVoiceStudioProject(left)) === JSON.stringify(normalizeVoiceStudioProject(right));
}

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

  commit(before: VoiceStudioProject, after: VoiceStudioProject, options: VoiceStudioHistoryCommitOptions): boolean {
    if (equivalent(before, after)) return false;
    const command = new AppliedProjectCommand(before, after, options);
    const previous = this.state.history.at(-1);
    if (options.merge && previous?.canMergeWith?.(command) && previous.mergeWith) {
      const merged = previous.mergeWith(command);
      this.state = {
        ...this.state,
        history: [...this.state.history.slice(0, -1), merged],
        future: [],
      };
      return true;
    }
    this.state = {
      ...this.state,
      history: [...this.state.history, command].slice(-this.state.limit),
      future: [],
    };
    return true;
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
