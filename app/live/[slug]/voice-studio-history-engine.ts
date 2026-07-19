import { cloneVoiceStudioProject, normalizeVoiceStudioProject, type VoiceStudioProject } from './voice-studio-project-model';

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

export type VoiceStudioHistoryEntry = {
  id: string;
  operation: VoiceStudioHistoryOperation;
  groupId?: string;
  label?: string;
  createdAt: string;
  project: VoiceStudioProject;
  signature: string;
};

export type VoiceStudioHistoryState = {
  history: VoiceStudioHistoryEntry[];
  future: VoiceStudioHistoryEntry[];
  limit: number;
};

export type VoiceStudioHistoryCommitOptions = {
  operation: VoiceStudioHistoryOperation;
  label?: string;
  groupId?: string;
  merge?: boolean;
};

const DEFAULT_HISTORY_LIMIT = 50;

function signature(project: VoiceStudioProject) {
  return JSON.stringify(normalizeVoiceStudioProject(project));
}

function createEntry(project: VoiceStudioProject, options: VoiceStudioHistoryCommitOptions): VoiceStudioHistoryEntry {
  return {
    id: crypto.randomUUID(),
    operation: options.operation,
    groupId: options.groupId,
    label: options.label,
    createdAt: new Date().toISOString(),
    project: cloneVoiceStudioProject(project),
    signature: signature(project),
  };
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

  configure(limit: number) {
    this.state.limit = Math.max(1, limit);
    this.state.history = this.state.history.slice(-this.state.limit);
    this.state.future = this.state.future.slice(0, this.state.limit);
  }

  reset() {
    this.state = { ...this.state, history: [], future: [] };
  }

  commit(before: VoiceStudioProject, after: VoiceStudioProject, options: VoiceStudioHistoryCommitOptions) {
    const beforeSignature = signature(before);
    const afterSignature = signature(after);
    if (beforeSignature === afterSignature) return false;

    const previous = this.state.history.at(-1);
    if (options.merge && previous?.operation === options.operation && previous.groupId && previous.groupId === options.groupId) {
      this.state = { ...this.state, future: [] };
      return true;
    }

    if (previous?.signature === beforeSignature && previous.operation === options.operation && previous.groupId === options.groupId) {
      this.state = { ...this.state, future: [] };
      return true;
    }

    this.state = {
      ...this.state,
      history: [...this.state.history, createEntry(before, options)].slice(-this.state.limit),
      future: [],
    };
    return true;
  }

  undo(current: VoiceStudioProject) {
    const entry = this.state.history.at(-1);
    if (!entry) return null;
    this.state = {
      ...this.state,
      history: this.state.history.slice(0, -1),
      future: [createEntry(current, { operation: entry.operation, label: entry.label, groupId: entry.groupId }), ...this.state.future].slice(0, this.state.limit),
    };
    return cloneVoiceStudioProject(entry.project);
  }

  redo(current: VoiceStudioProject) {
    const entry = this.state.future[0];
    if (!entry) return null;
    this.state = {
      ...this.state,
      history: [...this.state.history, createEntry(current, { operation: entry.operation, label: entry.label, groupId: entry.groupId })].slice(-this.state.limit),
      future: this.state.future.slice(1),
    };
    return cloneVoiceStudioProject(entry.project);
  }

  snapshot(): VoiceStudioHistoryState {
    return { ...this.state, history: [...this.state.history], future: [...this.state.future] };
  }
}
