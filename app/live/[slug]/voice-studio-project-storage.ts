import type { VoiceStudioProject } from './voice-studio-project-model';

const DATABASE_NAME = 'foco-voice-studio';
const DATABASE_VERSION = 2;
const PROJECTS_STORE = 'projects';
const ASSETS_STORE = 'asset-blobs';
const LIBRARY_STORE = 'audio-library';
const SESSION_STORE = 'current-session';
const ACTIVE_PROJECT_KEY = 'foco-voice-studio-active-project';
const CURRENT_SESSION_ID = 'current';

export type StoredProject = VoiceStudioProject & { savedAt: string };

export type VoiceStudioLibraryItem = {
  id: string;
  name: string;
  fileName: string;
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/x-wav' | 'audio/wave';
  duration: number;
  size: number;
  createdAt: string;
  updatedAt: string;
  blob: Blob;
};

type StoredAssetBlob = {
  id: string;
  projectId: string;
  blob: Blob;
  savedAt: string;
};

type StoredSession = {
  id: typeof CURRENT_SESSION_ID;
  project: VoiceStudioProject;
  blobs: Record<string, Blob>;
  savedAt: string;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao acessar o armazenamento do Voice Studio.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar os dados do Voice Studio.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('A gravação dos dados foi interrompida.'));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        const store = database.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
      if (!database.objectStoreNames.contains(LIBRARY_STORE)) {
        const store = database.createObjectStore(LIBRARY_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(SESSION_STORE)) database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o banco do Voice Studio.'));
  });
}

export function activeVoiceStudioProjectId() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export function setActiveVoiceStudioProjectId(projectId: string | null) {
  if (typeof window === 'undefined') return;
  if (projectId) window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
  else window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
}

export async function saveVoiceStudioProject(project: VoiceStudioProject, blobs: Record<string, Blob | undefined> = {}) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECTS_STORE, ASSETS_STORE], 'readwrite');
  const projectStore = transaction.objectStore(PROJECTS_STORE);
  const assetStore = transaction.objectStore(ASSETS_STORE);
  const now = new Date().toISOString();
  const stored: StoredProject = { ...project, updatedAt: now, savedAt: now };
  projectStore.put(stored);
  Object.entries(blobs).forEach(([assetId, blob]) => {
    if (!blob) return;
    assetStore.put({ id: assetId, projectId: project.id, blob, savedAt: now } satisfies StoredAssetBlob);
  });
  await transactionDone(transaction);
  database.close();
  setActiveVoiceStudioProjectId(project.id);
  return stored;
}

export async function loadVoiceStudioProject(projectId: string) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECTS_STORE, ASSETS_STORE], 'readonly');
  const project = await requestResult(transaction.objectStore(PROJECTS_STORE).get(projectId)) as StoredProject | undefined;
  if (!project) {
    database.close();
    return null;
  }
  const blobs: Record<string, Blob> = {};
  const records = await requestResult(transaction.objectStore(ASSETS_STORE).index('projectId').getAll(projectId)) as StoredAssetBlob[];
  records.forEach(record => { blobs[record.id] = record.blob; });
  await transactionDone(transaction);
  database.close();
  const { savedAt: _savedAt, ...cleanProject } = project;
  return { project: cleanProject as VoiceStudioProject, blobs };
}

export async function loadActiveVoiceStudioProject() {
  const id = activeVoiceStudioProjectId();
  return id ? loadVoiceStudioProject(id) : null;
}

export async function listVoiceStudioProjects() {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECTS_STORE, 'readonly');
  const projects = await requestResult(transaction.objectStore(PROJECTS_STORE).getAll()) as StoredProject[];
  await transactionDone(transaction);
  database.close();
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteVoiceStudioProject(projectId: string) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECTS_STORE, ASSETS_STORE], 'readwrite');
  transaction.objectStore(PROJECTS_STORE).delete(projectId);
  const assetStore = transaction.objectStore(ASSETS_STORE);
  const keys = await requestResult(assetStore.index('projectId').getAllKeys(projectId));
  keys.forEach(key => assetStore.delete(key));
  await transactionDone(transaction);
  database.close();
  if (activeVoiceStudioProjectId() === projectId) setActiveVoiceStudioProjectId(null);
}

export async function saveCurrentVoiceStudioSession(project: VoiceStudioProject, blobs: Record<string, Blob> = {}) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, 'readwrite');
  transaction.objectStore(SESSION_STORE).put({ id: CURRENT_SESSION_ID, project, blobs, savedAt: new Date().toISOString() } satisfies StoredSession);
  await transactionDone(transaction);
  database.close();
}

export async function loadCurrentVoiceStudioSession() {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, 'readonly');
  const session = await requestResult(transaction.objectStore(SESSION_STORE).get(CURRENT_SESSION_ID)) as StoredSession | undefined;
  await transactionDone(transaction);
  database.close();
  return session ?? null;
}

export async function clearCurrentVoiceStudioSession() {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, 'readwrite');
  transaction.objectStore(SESSION_STORE).delete(CURRENT_SESSION_ID);
  await transactionDone(transaction);
  database.close();
}

export async function importVoiceStudioLibraryAudio(file: File, duration: number, maxSizeBytes = 100 * 1024 * 1024) {
  const allowed = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave']);
  if (!allowed.has(file.type)) throw new Error('Formato inválido. Use arquivos MP3 ou WAV.');
  if (!file.size || file.size > maxSizeBytes) throw new Error('O arquivo excede o limite de 100 MB.');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('O arquivo de áudio parece estar corrompido.');
  const now = new Date().toISOString();
  const item: VoiceStudioLibraryItem = {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.(mp3|wav)$/i, ''),
    fileName: file.name,
    mimeType: file.type as VoiceStudioLibraryItem['mimeType'],
    duration,
    size: file.size,
    createdAt: now,
    updatedAt: now,
    blob: file,
  };
  const database = await openDatabase();
  const transaction = database.transaction(LIBRARY_STORE, 'readwrite');
  transaction.objectStore(LIBRARY_STORE).put(item);
  await transactionDone(transaction);
  database.close();
  return item;
}

export async function listVoiceStudioLibraryAudio() {
  const database = await openDatabase();
  const transaction = database.transaction(LIBRARY_STORE, 'readonly');
  const items = await requestResult(transaction.objectStore(LIBRARY_STORE).getAll()) as VoiceStudioLibraryItem[];
  await transactionDone(transaction);
  database.close();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function renameVoiceStudioLibraryAudio(id: string, name: string) {
  const nextName = name.trim();
  if (!nextName) throw new Error('Informe um nome para o áudio.');
  const database = await openDatabase();
  const transaction = database.transaction(LIBRARY_STORE, 'readwrite');
  const store = transaction.objectStore(LIBRARY_STORE);
  const item = await requestResult(store.get(id)) as VoiceStudioLibraryItem | undefined;
  if (!item) throw new Error('Áudio não encontrado.');
  const updated = { ...item, name: nextName, updatedAt: new Date().toISOString() };
  store.put(updated);
  await transactionDone(transaction);
  database.close();
  return updated;
}

export async function deleteVoiceStudioLibraryAudio(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(LIBRARY_STORE, 'readwrite');
  transaction.objectStore(LIBRARY_STORE).delete(id);
  await transactionDone(transaction);
  database.close();
}

export function createObjectUrls(blobs: Record<string, Blob>) {
  return Object.fromEntries(Object.entries(blobs).map(([assetId, blob]) => [assetId, URL.createObjectURL(blob)]));
}

export function revokeObjectUrls(urls: Record<string, string>) {
  Object.values(urls).forEach(url => URL.revokeObjectURL(url));
}
