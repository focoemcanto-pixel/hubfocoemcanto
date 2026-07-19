'use client';

export type VoiceStudioSnapshot<TProject = unknown> = {
  id: string;
  projectId: string;
  createdAt: string;
  reason: 'autosave' | 'manual' | 'recovery';
  checksum: string;
  data: TProject;
};

export type VoiceStudioAutosaveOptions<TProject> = {
  projectId: string;
  getProject: () => TProject;
  onSaved?: (snapshot: VoiceStudioSnapshot<TProject>) => void;
  onError?: (error: Error) => void;
  intervalMs?: number;
  maxSnapshots?: number;
  storage?: Storage;
};

const STORAGE_PREFIX = 'foco-voice-studio-autosave:';
const RECOVERY_PREFIX = 'foco-voice-studio-recovery:';

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stableSerialize(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (_key, current) => {
    if (!current || typeof current !== 'object') return current;
    if (seen.has(current)) return '[Circular]';
    seen.add(current);

    if (Array.isArray(current)) return current;

    return Object.keys(current)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = (current as Record<string, unknown>)[key];
        return result;
      }, {});
  });
}

function checksum(value: unknown): string {
  const source = stableSerialize(value);
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function snapshotKey(projectId: string) {
  return `${STORAGE_PREFIX}${projectId}`;
}

function recoveryKey(projectId: string) {
  return `${RECOVERY_PREFIX}${projectId}`;
}

function getDefaultStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function loadVoiceStudioSnapshots<TProject = unknown>(projectId: string, storage = getDefaultStorage()): VoiceStudioSnapshot<TProject>[] {
  if (!storage) return [];

  try {
    const parsed = JSON.parse(storage.getItem(snapshotKey(projectId)) || '[]') as VoiceStudioSnapshot<TProject>[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(item => item?.id && item?.projectId === projectId && item?.createdAt && item?.checksum)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch {
    return [];
  }
}

export function loadVoiceStudioRecovery<TProject = unknown>(projectId: string, storage = getDefaultStorage()): VoiceStudioSnapshot<TProject> | null {
  if (!storage) return null;

  try {
    const parsed = JSON.parse(storage.getItem(recoveryKey(projectId)) || 'null') as VoiceStudioSnapshot<TProject> | null;
    return parsed?.projectId === projectId ? parsed : null;
  } catch {
    return null;
  }
}

export function clearVoiceStudioRecovery(projectId: string, storage = getDefaultStorage()) {
  storage?.removeItem(recoveryKey(projectId));
}

export function deleteVoiceStudioSnapshot(projectId: string, snapshotId: string, storage = getDefaultStorage()) {
  if (!storage) return;
  const remaining = loadVoiceStudioSnapshots(projectId, storage).filter(item => item.id !== snapshotId);
  storage.setItem(snapshotKey(projectId), JSON.stringify(remaining));
}

export class VoiceStudioAutosave<TProject = unknown> {
  private readonly projectId: string;
  private readonly getProject: () => TProject;
  private readonly onSaved?: (snapshot: VoiceStudioSnapshot<TProject>) => void;
  private readonly onError?: (error: Error) => void;
  private readonly intervalMs: number;
  private readonly maxSnapshots: number;
  private readonly storage: Storage | null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastChecksum = '';
  private dirty = false;
  private disposed = false;

  constructor(options: VoiceStudioAutosaveOptions<TProject>) {
    this.projectId = options.projectId;
    this.getProject = options.getProject;
    this.onSaved = options.onSaved;
    this.onError = options.onError;
    this.intervalMs = Math.max(2_000, options.intervalMs ?? 10_000);
    this.maxSnapshots = Math.max(1, options.maxSnapshots ?? 30);
    this.storage = options.storage ?? getDefaultStorage();

    const latest = loadVoiceStudioSnapshots<TProject>(this.projectId, this.storage)[0];
    this.lastChecksum = latest?.checksum || '';
  }

  start() {
    if (this.timer || this.disposed) return;
    this.timer = setInterval(() => void this.flush('autosave'), this.intervalMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  markDirty() {
    this.dirty = true;
    this.writeRecovery();
  }

  async saveNow() {
    return this.flush('manual', true);
  }

  restore(snapshotId?: string): TProject | null {
    const snapshots = loadVoiceStudioSnapshots<TProject>(this.projectId, this.storage);
    const snapshot = snapshotId ? snapshots.find(item => item.id === snapshotId) : snapshots[0];
    if (!snapshot) return null;

    this.lastChecksum = snapshot.checksum;
    this.dirty = false;
    clearVoiceStudioRecovery(this.projectId, this.storage);
    return snapshot.data;
  }

  restoreRecovery(): TProject | null {
    const recovery = loadVoiceStudioRecovery<TProject>(this.projectId, this.storage);
    if (!recovery) return null;

    this.lastChecksum = recovery.checksum;
    this.dirty = false;
    return recovery.data;
  }

  listSnapshots() {
    return loadVoiceStudioSnapshots<TProject>(this.projectId, this.storage);
  }

  dispose() {
    this.stop();
    this.disposed = true;
  }

  private async flush(reason: VoiceStudioSnapshot<TProject>['reason'], force = false) {
    if (!this.storage || this.disposed || (!this.dirty && !force)) return null;

    try {
      const data = this.getProject();
      const currentChecksum = checksum(data);

      if (!force && currentChecksum === this.lastChecksum) {
        this.dirty = false;
        return null;
      }

      const snapshot: VoiceStudioSnapshot<TProject> = {
        id: createId(),
        projectId: this.projectId,
        createdAt: new Date().toISOString(),
        reason,
        checksum: currentChecksum,
        data,
      };

      const snapshots = [snapshot, ...loadVoiceStudioSnapshots<TProject>(this.projectId, this.storage)]
        .filter((item, index, all) => all.findIndex(candidate => candidate.checksum === item.checksum) === index)
        .slice(0, this.maxSnapshots);

      this.storage.setItem(snapshotKey(this.projectId), JSON.stringify(snapshots));
      this.storage.removeItem(recoveryKey(this.projectId));
      this.lastChecksum = currentChecksum;
      this.dirty = false;
      this.onSaved?.(snapshot);
      return snapshot;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Falha ao salvar o snapshot do projeto.');
      this.onError?.(error);
      return null;
    }
  }

  private writeRecovery() {
    if (!this.storage || this.disposed) return;

    try {
      const data = this.getProject();
      const snapshot: VoiceStudioSnapshot<TProject> = {
        id: createId(),
        projectId: this.projectId,
        createdAt: new Date().toISOString(),
        reason: 'recovery',
        checksum: checksum(data),
        data,
      };
      this.storage.setItem(recoveryKey(this.projectId), JSON.stringify(snapshot));
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Falha ao criar o arquivo de recuperação.');
      this.onError?.(error);
    }
  }
}
