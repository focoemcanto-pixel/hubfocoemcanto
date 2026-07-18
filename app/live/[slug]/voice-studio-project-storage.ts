import type { VoiceStudioProject } from './voice-studio-project-model';

const DATABASE_NAME = 'foco-voice-studio';
const DATABASE_VERSION = 1;
const PROJECTS_STORE = 'projects';
const ASSETS_STORE = 'asset-blobs';
const ACTIVE_PROJECT_KEY = 'foco-voice-studio-active-project';

type StoredProject = VoiceStudioProject & { savedAt: string };

type StoredAssetBlob = {
  id: string;
  projectId: string;
  blob: Blob;
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
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar o projeto.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('A gravação do projeto foi interrompida.'));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        const store = database.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
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

export async function saveVoiceStudioProject(
  project: VoiceStudioProject,
  blobs: Record<string, Blob | undefined> = {},
) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECTS_STORE, ASSETS_STORE], 'readwrite');
  const projectStore = transaction.objectStore(PROJECTS_STORE);
  const assetStore = transaction.objectStore(ASSETS_STORE);
  const now = new Date().toISOString();
  const stored: StoredProject = { ...project, updatedAt: now, savedAt: now };
  projectStore.put(stored);

  Object.entries(blobs).forEach(([assetId, blob]) => {
    if (!blob) return;
    const record: StoredAssetBlob = { id: assetId, projectId: project.id, blob, savedAt: now };
    assetStore.put(record);
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
  const assetStore = transaction.objectStore(ASSETS_STORE);
  const index = assetStore.index('projectId');
  const records = await requestResult(index.getAll(projectId)) as StoredAssetBlob[];
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
  const index = assetStore.index('projectId');
  const keys = await requestResult(index.getAllKeys(projectId));
  keys.forEach(key => assetStore.delete(key));
  await transactionDone(transaction);
  database.close();
  if (activeVoiceStudioProjectId() === projectId) setActiveVoiceStudioProjectId(null);
}

export function createObjectUrls(blobs: Record<string, Blob>) {
  return Object.fromEntries(Object.entries(blobs).map(([assetId, blob]) => [assetId, URL.createObjectURL(blob)]));
}

export function revokeObjectUrls(urls: Record<string, string>) {
  Object.values(urls).forEach(url => URL.revokeObjectURL(url));
}
