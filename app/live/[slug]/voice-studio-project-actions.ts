import {
  DeleteClipCommand,
  DuplicateClipCommand,
  MoveClipCommand,
  SplitClipCommand,
  TrimClipCommand,
  type TrimClipEdge,
  type VoiceStudioCommand,
  type VoiceStudioCommandKind,
} from './voice-studio-commands';
import type { VoiceStudioEventBus } from './voice-studio-event-bus';
import { VoiceStudioHistoryEngine } from './voice-studio-history-engine';
import {
  cloneVoiceStudioProject,
  normalizeVoiceStudioProject,
  updateClipFade,
  type VoiceStudioProject,
} from './voice-studio-project-model';

export type VoiceStudioProjectActionOptions = { merge?: boolean; groupId?: string };
export type VoiceStudioFadeInput = { fadeIn?: number; fadeOut?: number };
type ProjectMutation = (project: VoiceStudioProject) => VoiceStudioProject;

class ProjectMutationCommand implements VoiceStudioCommand {
  readonly id = crypto.randomUUID();
  readonly kind: VoiceStudioCommandKind = 'project-mutation';
  readonly createdAt = new Date().toISOString();
  readonly groupId?: string;
  readonly label: string;
  #before: VoiceStudioProject | null = null;
  #after: VoiceStudioProject | null = null;
  readonly #mutate: ProjectMutation;

  constructor(label: string, mutate: ProjectMutation, groupId?: string) {
    this.label = label;
    this.#mutate = mutate;
    this.groupId = groupId;
  }
  execute(project: VoiceStudioProject): VoiceStudioProject {
    if (this.#after) return cloneVoiceStudioProject(this.#after);
    this.#before = cloneVoiceStudioProject(project);
    this.#after = cloneVoiceStudioProject(this.#mutate(project));
    return cloneVoiceStudioProject(this.#after);
  }
  undo(project: VoiceStudioProject): VoiceStudioProject { return this.#before ? cloneVoiceStudioProject(this.#before) : project; }
  canMergeWith(command: VoiceStudioCommand): boolean {
    return command instanceof ProjectMutationCommand && Boolean(this.groupId) && command.groupId === this.groupId && command.label === this.label;
  }
  mergeWith(command: VoiceStudioCommand): VoiceStudioCommand { return command instanceof ProjectMutationCommand ? command : this; }
}

function replaceProject(target: VoiceStudioProject, source: VoiceStudioProject): VoiceStudioProject {
  Object.keys(target).forEach(key => delete (target as unknown as Record<string, unknown>)[key]);
  Object.assign(target, cloneVoiceStudioProject(source));
  return target;
}
function updateTimestamp(project: VoiceStudioProject): VoiceStudioProject { project.updatedAt = new Date().toISOString(); return project; }

export class VoiceStudioProjectActions {
  readonly #project: VoiceStudioProject;
  readonly #history: VoiceStudioHistoryEngine;
  readonly #eventBus: VoiceStudioEventBus;

  constructor(project: VoiceStudioProject, history: VoiceStudioHistoryEngine, eventBus: VoiceStudioEventBus) {
    this.#project = project;
    this.#history = history;
    this.#eventBus = eventBus;
  }

  get project(): VoiceStudioProject { return this.#project; }
  moveClip(clipId: string, targetTrackId: string, start: number, options: VoiceStudioProjectActionOptions = {}): VoiceStudioProject { return this.#execute(new MoveClipCommand(clipId, targetTrackId, start, options.groupId), options); }
  splitClip(clipId: string, playhead: number): VoiceStudioProject { return this.#execute(new SplitClipCommand(clipId, playhead)); }
  trim(clipId: string, edge: TrimClipEdge, time: number, options: VoiceStudioProjectActionOptions = {}): VoiceStudioProject { return this.#execute(new TrimClipCommand(clipId, edge, time, options.groupId), options); }
  delete(clipId: string): VoiceStudioProject { return this.#execute(new DeleteClipCommand(clipId)); }
  deleteClip(clipId: string): VoiceStudioProject { return this.delete(clipId); }
  duplicate(clipId: string, start?: number, targetTrackId?: string): VoiceStudioProject { return this.#execute(new DuplicateClipCommand(clipId, start, targetTrackId)); }
  duplicateClip(clipId: string, start?: number, targetTrackId?: string): VoiceStudioProject { return this.duplicate(clipId, start, targetTrackId); }

  renameTrack(trackId: string, name: string): VoiceStudioProject {
    const nextName = name.trim();
    if (!nextName) return this.#project;
    const result = this.#mutation('Rename track', project => {
      const next = cloneVoiceStudioProject(project);
      const track = next.tracks.find(item => item.id === trackId);
      if (!track || track.name === nextName) return project;
      track.name = nextName;
      return updateTimestamp(next);
    });
    const track = result.tracks.find(item => item.id === trackId);
    if (track) this.#eventBus.publish('TRACK_UPDATED', { track, project: result });
    return result;
  }

  moveTrack(trackId: string, targetIndex: number): VoiceStudioProject {
    const result = this.#mutation('Move track', project => {
      const sourceIndex = project.tracks.findIndex(track => track.id === trackId);
      if (sourceIndex < 0) return project;
      const boundedIndex = Math.min(project.tracks.length - 1, Math.max(0, Math.floor(targetIndex)));
      if (sourceIndex === boundedIndex) return project;
      const next = cloneVoiceStudioProject(project);
      const [track] = next.tracks.splice(sourceIndex, 1);
      next.tracks.splice(boundedIndex, 0, track);
      return updateTimestamp(next);
    });
    const track = result.tracks.find(item => item.id === trackId);
    if (track) this.#eventBus.publish('TRACK_UPDATED', { track, project: result });
    return result;
  }

  fade(clipId: string, input: VoiceStudioFadeInput, options: VoiceStudioProjectActionOptions = {}): VoiceStudioProject {
    return this.#mutation('Fade clip', project => updateClipFade(project, clipId, input), { ...options, groupId: options.groupId ?? `fade:${clipId}` });
  }
  normalize(): VoiceStudioProject { return this.#mutation('Normalize project', project => normalizeVoiceStudioProject(project), {}, 'normalize'); }

  undo(): VoiceStudioProject {
    const previous = this.#history.undo(this.#project);
    if (!previous) return this.#project;
    const project = replaceProject(this.#project, previous);
    this.#eventBus.publish('PROJECT_CHANGED', { project, source: 'undo' });
    return project;
  }
  redo(): VoiceStudioProject {
    const next = this.#history.redo(this.#project);
    if (!next) return this.#project;
    const project = replaceProject(this.#project, next);
    this.#eventBus.publish('PROJECT_CHANGED', { project, source: 'redo' });
    return project;
  }

  #mutation(label: string, mutate: ProjectMutation, options: VoiceStudioProjectActionOptions = {}, source: 'actions' | 'normalize' = 'actions'): VoiceStudioProject {
    return this.#execute(new ProjectMutationCommand(label, mutate, options.groupId), options, source);
  }
  #execute(command: VoiceStudioCommand, options: VoiceStudioProjectActionOptions = {}, source: 'actions' | 'normalize' = 'actions'): VoiceStudioProject {
    const next = this.#history.execute(this.#project, command, { merge: options.merge });
    if (next === this.#project) return this.#project;
    const project = replaceProject(this.#project, next);
    this.#eventBus.publish('PROJECT_CHANGED', { project, source });
    return project;
  }
}

export function createVoiceStudioProjectActions(project: VoiceStudioProject, history: VoiceStudioHistoryEngine, eventBus: VoiceStudioEventBus): VoiceStudioProjectActions {
  return new VoiceStudioProjectActions(project, history, eventBus);
}
