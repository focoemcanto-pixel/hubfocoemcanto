'use client';

import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileAudio, FolderOpen, Loader2, MoreHorizontal, Plus, Save, Settings, Trash2, Upload, X } from 'lucide-react';
import { createVoiceStudioProject, type VoiceStudioProject } from './voice-studio-project-model';
import {
  clearCurrentVoiceStudioSession,
  deleteVoiceStudioLibraryAudio,
  deleteVoiceStudioProject,
  importVoiceStudioLibraryAudio,
  listVoiceStudioLibraryAudio,
  listVoiceStudioProjects,
  loadActiveVoiceStudioProject,
  loadCurrentVoiceStudioSession,
  loadVoiceStudioProject,
  renameVoiceStudioLibraryAudio,
  saveCurrentVoiceStudioSession,
  saveVoiceStudioProject,
  type StoredProject,
  type VoiceStudioLibraryItem,
} from './voice-studio-project-storage';

type Tab = 'session' | 'projects' | 'library' | 'settings';
type ToastKind = 'success' | 'error';
type Toast = { kind: ToastKind; message: string } | null;
type StudioSnapshot = { project: VoiceStudioProject; blobs?: Record<string, Blob> };

const SNAPSHOT_EVENT = 'foco-voice-studio-snapshot';
const LOAD_EVENT = 'foco-voice-studio-load-project';
const REQUEST_EVENT = 'foco-voice-studio-request-snapshot';

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function audioDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => { audio.src = ''; URL.revokeObjectURL(url); };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const value = audio.duration;
      cleanup();
      if (Number.isFinite(value) && value > 0) resolve(value);
      else reject(new Error('Arquivo inválido.'));
    };
    audio.onerror = () => { cleanup(); reject(new Error('Não foi possível ler o áudio.')); };
    audio.src = url;
  });
}

export default function VoiceStudioProjectManager({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('session');
  const [project, setProject] = useState<VoiceStudioProject>(() => createVoiceStudioProject());
  const [blobs, setBlobs] = useState<Record<string, Blob>>({});
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [library, setLibrary] = useState<VoiceStudioLibraryItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'project' | 'audio'; id: string; name: string } | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notice = useCallback((kind: ToastKind, message: string) => {
    setToast({ kind, message });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshLists = useCallback(async () => {
    const [nextProjects, nextLibrary] = await Promise.all([listVoiceStudioProjects(), listVoiceStudioLibraryAudio()]);
    setProjects(nextProjects);
    setLibrary(nextLibrary);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await loadCurrentVoiceStudioSession();
        const active = current ?? await loadActiveVoiceStudioProject();
        if (cancelled) return;
        if (active) {
          setProject(active.project);
          setBlobs(active.blobs);
          window.dispatchEvent(new CustomEvent(LOAD_EVENT, { detail: active }));
        }
        await refreshLists();
      } catch (error) {
        if (!cancelled) notice('error', error instanceof Error ? error.message : 'Não foi possível abrir a última sessão.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [notice, refreshLists]);

  useEffect(() => {
    const receive = (event: Event) => {
      const snapshot = (event as CustomEvent<StudioSnapshot>).detail;
      if (!snapshot?.project) return;
      setProject(snapshot.project);
      setBlobs(snapshot.blobs ?? {});
      setDirty(true);
    };
    window.addEventListener(SNAPSHOT_EVENT, receive);
    return () => window.removeEventListener(SNAPSHOT_EVENT, receive);
  }, []);

  useEffect(() => {
    if (!dirty || loading) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void saveCurrentVoiceStudioSession(project, blobs).catch(error => notice('error', error instanceof Error ? error.message : 'Falha no autosave.'));
    }, 900);
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [blobs, dirty, loading, notice, project]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => () => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  function requestSnapshot() { window.dispatchEvent(new CustomEvent(REQUEST_EVENT)); }

  async function saveCurrent(saveAs = false) {
    setBusy(true);
    try {
      requestSnapshot();
      await new Promise(resolve => window.setTimeout(resolve, 30));
      const name = saveAs ? window.prompt('Nome do novo projeto', `${project.name} cópia`)?.trim() : project.name.trim();
      if (!name) return;
      const next: VoiceStudioProject = saveAs
        ? { ...project, id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : { ...project, name };
      const stored = await saveVoiceStudioProject(next, blobs);
      setProject(stored);
      setDirty(false);
      await clearCurrentVoiceStudioSession();
      await refreshLists();
      notice('success', saveAs ? 'Projeto salvo como uma nova versão.' : 'Projeto salvo com sucesso.');
    } catch (error) {
      notice('error', error instanceof Error ? error.message : 'Não foi possível salvar o projeto.');
    } finally {
      setBusy(false);
    }
  }

  async function newProject() {
    if (dirty && !window.confirm('Existem alterações não salvas. Descartar e criar um novo projeto?')) return;
    const next = createVoiceStudioProject('Novo projeto');
    setProject(next);
    setBlobs({});
    setDirty(false);
    await clearCurrentVoiceStudioSession();
    window.dispatchEvent(new CustomEvent(LOAD_EVENT, { detail: { project: next, blobs: {} } }));
    setProjectMenu(false);
    setTab('session');
  }

  async function openProject(id: string) {
    if (dirty && !window.confirm('Existem alterações não salvas. Descartar e abrir outro projeto?')) return;
    setBusy(true);
    try {
      const loaded = await loadVoiceStudioProject(id);
      if (!loaded) throw new Error('Projeto não encontrado.');
      setProject(loaded.project);
      setBlobs(loaded.blobs);
      setDirty(false);
      window.dispatchEvent(new CustomEvent(LOAD_EVENT, { detail: loaded }));
      setTab('session');
      notice('success', `Projeto “${loaded.project.name}” aberto.`);
    } catch (error) {
      notice('error', error instanceof Error ? error.message : 'Não foi possível abrir o projeto.');
    } finally {
      setBusy(false);
    }
  }

  function renameProject() {
    const name = window.prompt('Novo nome do projeto', project.name)?.trim();
    if (!name || name === project.name) return;
    setProject(current => ({ ...current, name, updatedAt: new Date().toISOString() }));
    setDirty(true);
    setProjectMenu(false);
  }

  async function importAudio(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const duration = await audioDuration(file);
        await importVoiceStudioLibraryAudio(file, duration);
      }
      await refreshLists();
      notice('success', files.length === 1 ? 'Áudio adicionado à biblioteca.' : `${files.length} áudios adicionados à biblioteca.`);
    } catch (error) {
      notice('error', error instanceof Error ? error.message : 'Não foi possível importar o áudio.');
    } finally {
      setBusy(false);
    }
  }

  async function renameAudio(item: VoiceStudioLibraryItem) {
    const name = window.prompt('Nome do áudio', item.name)?.trim();
    if (!name || name === item.name) return;
    try {
      await renameVoiceStudioLibraryAudio(item.id, name);
      await refreshLists();
      notice('success', 'Áudio renomeado.');
    } catch (error) {
      notice('error', error instanceof Error ? error.message : 'Não foi possível renomear o áudio.');
    }
  }

  async function performDelete() {
    if (!confirmDelete) return;
    const pending = confirmDelete;
    setBusy(true);
    try {
      if (pending.type === 'project') await deleteVoiceStudioProject(pending.id);
      else await deleteVoiceStudioLibraryAudio(pending.id);
      await refreshLists();
      setConfirmDelete(null);
      notice('success', pending.type === 'project' ? 'Projeto excluído.' : 'Áudio removido da biblioteca.');
    } catch (error) {
      notice('error', error instanceof Error ? error.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  }

  const updatedLabel = useMemo(() => new Date(project.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), [project.updatedAt]);

  if (loading) return <div className="vs-manager-loading"><Loader2 className="spin" /><div><strong>Abrindo a última sessão</strong><span>Preparando projetos, biblioteca e timeline…</span></div></div>;

  return <section className="vs-manager-shell">
    <header className="vs-manager-topbar">
      <div className="vs-manager-brand"><strong>Voice Studio</strong><span>Editor de projetos do professor</span></div>
      <nav>
        <button className={tab === 'session' ? 'active' : ''} onClick={() => setTab('session')}>Sessão Atual</button>
        <button className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}>Projetos</button>
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>Biblioteca de Áudios</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings size={15} /> Configurações</button>
      </nav>
      <div className="vs-project-actions">
        {dirty && <span className="vs-unsaved"><i /> Alterações não salvas</span>}
        <div className="vs-project-menu-wrap">
          <button onClick={() => setProjectMenu(value => !value)}>Projeto <ChevronDown size={15} /></button>
          {projectMenu && <div className="vs-project-menu">
            <button onClick={() => void newProject()}><Plus size={15} /> Novo Projeto</button>
            <button onClick={() => { setTab('projects'); setProjectMenu(false); }}><FolderOpen size={15} /> Abrir Projeto</button>
            <button onClick={() => void saveCurrent(false)} disabled={busy}><Save size={15} /> Salvar</button>
            <button onClick={() => void saveCurrent(true)} disabled={busy}>Salvar Como</button>
            <button onClick={renameProject}>Renomear</button>
            <button className="danger" onClick={() => { setConfirmDelete({ type: 'project', id: project.id, name: project.name }); setProjectMenu(false); }}><Trash2 size={15} /> Excluir</button>
          </div>}
        </div>
        <button className="vs-save-primary" onClick={() => void saveCurrent(false)} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Salvar</button>
      </div>
    </header>

    {tab === 'session' && <div className="vs-session-view">
      <div className="vs-session-meta"><div><span>Projeto atual</span><strong>{project.name}</strong><small>Atualizado em {updatedLabel}</small></div><div><span>BPM</span><strong>{project.tempo}</strong></div><div><span>Faixas</span><strong>{project.tracks.length}</strong></div><div><span>Assets referenciados</span><strong>{Object.keys(project.assets).length}</strong></div></div>
      <div className="vs-editor-slot">{children}</div>
    </div>}

    {tab === 'projects' && <div className="vs-manager-panel"><div className="vs-panel-head"><div><strong>Projetos</strong><span>Projetos referenciam os áudios da biblioteca sem criar cópias.</span></div><button onClick={() => void newProject()}><Plus size={16} /> Novo Projeto</button></div>{projects.length ? <div className="vs-project-grid">{projects.map(item => <article key={item.id}><div><span>{item.tracks.length} faixas</span><strong>{item.name}</strong><small>{new Date(item.updatedAt).toLocaleString('pt-BR')}</small></div><div><button onClick={() => void openProject(item.id)}><FolderOpen size={15} /> Abrir</button><button className="icon" onClick={() => setConfirmDelete({ type: 'project', id: item.id, name: item.name })}><Trash2 size={15} /></button></div></article>)}</div> : <Empty icon={<FolderOpen />} title="Nenhum projeto salvo" text="A Sessão Atual só se torna um projeto quando você clicar em Salvar." />}</div>}

    {tab === 'library' && <div className="vs-manager-panel"><div className="vs-panel-head"><div><strong>Biblioteca de Áudios</strong><span>Importe uma vez e reutilize em qualquer projeto.</span></div><label className="vs-import-button"><Upload size={16} /> Importar MP3 ou WAV<input type="file" accept="audio/mpeg,audio/wav,audio/x-wav" multiple hidden onChange={importAudio} /></label></div>{library.length ? <div className="vs-library-list">{library.map(item => <LibraryAudioRow key={item.id} item={item} onRename={renameAudio} onDelete={() => setConfirmDelete({ type: 'audio', id: item.id, name: item.name })} />)}</div> : <Empty icon={<FileAudio />} title="Biblioteca vazia" text="Arquivos importados ficam disponíveis para todos os projetos futuros." />}</div>}

    {tab === 'settings' && <div className="vs-manager-panel"><div className="vs-panel-head"><div><strong>Configurações</strong><span>Preferências do editor e segurança de arquivos.</span></div></div><div className="vs-settings-grid"><article><strong>Autosave</strong><span>Apenas a Sessão Atual é salva automaticamente. Nenhum projeto é criado sem sua ação.</span><b>Ativo</b></article><article><strong>Formatos permitidos</strong><span>MP3 e WAV, com validação de duração e integridade.</span><b>100 MB por arquivo</b></article><article><strong>Armazenamento</strong><span>Projetos e biblioteca permanecem locais neste navegador.</span><b>IndexedDB</b></article></div></div>}

    {toast && <div className={`vs-toast ${toast.kind}`}>{toast.message}<button onClick={() => setToast(null)}><X size={14} /></button></div>}
    {confirmDelete && <div className="vs-dialog-backdrop"><div className="vs-dialog"><Trash2 size={28} /><strong>Excluir “{confirmDelete.name}”?</strong><p>Esta ação não pode ser desfeita.</p><div><button onClick={() => setConfirmDelete(null)}>Cancelar</button><button className="danger" onClick={() => void performDelete()} disabled={busy}>Excluir</button></div></div></div>}
  </section>;
}

function LibraryAudioRow({ item, onRename, onDelete }: { item: VoiceStudioLibraryItem; onRename: (item: VoiceStudioLibraryItem) => void; onDelete: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(item.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [item.blob]);
  return <article><FileAudio size={24} /><div><strong>{item.name}</strong><span>{formatDuration(item.duration)} · {formatBytes(item.size)} · {new Date(item.createdAt).toLocaleDateString('pt-BR')}</span></div><audio controls preload="metadata" src={url} /><button onClick={() => onRename(item)}><MoreHorizontal size={16} /> Renomear</button><button className="icon danger" onClick={onDelete}><Trash2 size={16} /></button></article>;
}

function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="vs-manager-empty">{icon}<strong>{title}</strong><span>{text}</span></div>;
}
