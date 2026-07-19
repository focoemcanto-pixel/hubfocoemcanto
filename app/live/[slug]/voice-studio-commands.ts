import {
  cloneVoiceStudioProject,
  deleteClip,
  duplicateClip,
  findClip,
  moveClip,
  splitClip,
  trimClipEnd,
  trimClipStart,
  type VoiceStudioProject,
} from './voice-studio-project-model';

export type VoiceStudioCommandKind =
  | 'move-clip'
  | 'split-clip'
  | 'delete-clip'
  | 'duplicate-clip'
  | 'trim-clip'
  | 'project-mutation';

export interface VoiceStudioCommand {
  readonly id: string;
  readonly kind: VoiceStudioCommandKind;
  readonly label: string;
  readonly createdAt: string;
  readonly groupId?: string;
  execute(project: VoiceStudioProject): VoiceStudioProject;
  undo(project: VoiceStudioProject): VoiceStudioProject;
  canMergeWith?(command: VoiceStudioCommand): boolean;
  mergeWith?(command: VoiceStudioCommand): VoiceStudioCommand;
}

abstract class ProjectCommand implements VoiceStudioCommand {
  readonly id = crypto.randomUUID();
  readonly createdAt = new Date().toISOString();
  abstract readonly kind: VoiceStudioCommandKind;
  abstract readonly label: string;
  readonly groupId?: string;
  #before: VoiceStudioProject | null = null;
  #after: VoiceStudioProject | null = null;

  protected constructor(groupId?: string) {
    this.groupId = groupId;
  }

  execute(project: VoiceStudioProject): VoiceStudioProject {
    if (this.#after) return cloneVoiceStudioProject(this.#after);
    this.#before = cloneVoiceStudioProject(project);
    this.#after = cloneVoiceStudioProject(this.apply(project));
    return cloneVoiceStudioProject(this.#after);
  }

  undo(project: VoiceStudioProject): VoiceStudioProject {
    return this.#before ? cloneVoiceStudioProject(this.#before) : project;
  }

  protected abstract apply(project: VoiceStudioProject): VoiceStudioProject;
}

export class MoveClipCommand extends ProjectCommand {
  readonly kind = 'move-clip' as const;
  readonly label = 'Move clip';

  constructor(
    readonly clipId: string,
    readonly targetTrackId: string,
    readonly start: number,
    groupId = `move:${clipId}`,
  ) {
    super(groupId);
  }

  protected apply(project: VoiceStudioProject): VoiceStudioProject {
    return moveClip(project, this.clipId, this.targetTrackId, this.start);
  }

  canMergeWith(command: VoiceStudioCommand): boolean {
    return command instanceof MoveClipCommand && command.clipId === this.clipId && command.groupId === this.groupId;
  }

  mergeWith(command: VoiceStudioCommand): VoiceStudioCommand {
    if (!(command instanceof MoveClipCommand) || !this.canMergeWith(command)) return command;
    return new MoveClipCommand(this.clipId, command.targetTrackId, command.start, this.groupId);
  }
}

export class SplitClipCommand extends ProjectCommand {
  readonly kind = 'split-clip' as const;
  readonly label = 'Split clip';

  constructor(readonly clipId: string, readonly playhead: number) {
    super();
  }

  protected apply(project: VoiceStudioProject): VoiceStudioProject {
    return splitClip(project, this.clipId, this.playhead);
  }
}

export class DeleteClipCommand extends ProjectCommand {
  readonly kind = 'delete-clip' as const;
  readonly label = 'Delete clip';

  constructor(readonly clipId: string) {
    super();
  }

  protected apply(project: VoiceStudioProject): VoiceStudioProject {
    return deleteClip(project, this.clipId);
  }
}

export class DuplicateClipCommand extends ProjectCommand {
  readonly kind = 'duplicate-clip' as const;
  readonly label = 'Duplicate clip';

  constructor(
    readonly clipId: string,
    readonly start?: number,
    readonly targetTrackId?: string,
  ) {
    super();
  }

  protected apply(project: VoiceStudioProject): VoiceStudioProject {
    return duplicateClip(project, this.clipId, this.start, this.targetTrackId);
  }
}

export type TrimClipEdge = 'start' | 'end';

export class TrimClipCommand extends ProjectCommand {
  readonly kind = 'trim-clip' as const;
  readonly label = 'Trim clip';

  constructor(
    readonly clipId: string,
    readonly edge: TrimClipEdge,
    readonly time: number,
    groupId = `trim:${clipId}:${edge}`,
  ) {
    super(groupId);
  }

  protected apply(project: VoiceStudioProject): VoiceStudioProject {
    return this.edge === 'start'
      ? trimClipStart(project, this.clipId, this.time)
      : trimClipEnd(project, this.clipId, this.time);
  }

  canMergeWith(command: VoiceStudioCommand): boolean {
    return command instanceof TrimClipCommand
      && command.clipId === this.clipId
      && command.edge === this.edge
      && command.groupId === this.groupId;
  }

  mergeWith(command: VoiceStudioCommand): VoiceStudioCommand {
    if (!(command instanceof TrimClipCommand) || !this.canMergeWith(command)) return command;
    return new TrimClipCommand(this.clipId, this.edge, command.time, this.groupId);
  }
}

export function commandChangedProject(before: VoiceStudioProject, after: VoiceStudioProject): boolean {
  return before !== after && JSON.stringify(before) !== JSON.stringify(after);
}

export function commandTargetExists(project: VoiceStudioProject, command: VoiceStudioCommand): boolean {
  if (command instanceof MoveClipCommand || command instanceof SplitClipCommand || command instanceof DeleteClipCommand || command instanceof DuplicateClipCommand || command instanceof TrimClipCommand) {
    return Boolean(findClip(project, command.clipId));
  }
  return true;
}
