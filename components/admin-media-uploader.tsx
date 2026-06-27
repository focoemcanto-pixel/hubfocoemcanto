'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FolderUp, Loader2, RefreshCw, UploadCloud, Video, XCircle } from 'lucide-react';

type ModuleOption = { id: string; title: string; slug?: string | null };
type Props = { productId?: string; productName?: string | null; modules?: ModuleOption[]; migrationOnly?: boolean; totalLessons?: number; migratedLessons?: number; driveLessons?: number };
type UploadResult = { key: string; publicUrl: string; uploadUrl: string; expiresIn: number };
type SyncResult = { total: number; linked: number; unmatchedCount: number; errorsCount: number; durationSeconds: number; sizeBytes: number; syncedAt: string; unmatched: Array<{ uid: string; name: string; status: string }>; errors?: Array<{ uid: string; name: string; message: string }> };
type QueueStatus = 'queued' | 'uploading' | 'done' | 'linked' | 'error';
type MediaType = 'audio' | 'image' | 'file';
type UploadDestination = 'stream' | 'r2';
type R2Item = { id: string; file: File; name: string; relativePath: string; type: string; size: number; status: QueueStatus; progress: number; attempts: number; url?: string; error?: string };
type StreamItem = R2Item & { uid?: string };

const RETRY_LIMIT = 5;
const RETRY_DELAYS = [2000, 5000, 10000, 20000, 35000];
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function inferMediaType(file: File): MediaType { if (file.type.startsWith('audio/')) return 'audio'; if (file.type.startsWith('image/')) return 'image'; return 'file'; }
function formatDuration(totalSeconds: number) { const totalMinutes = Math.round(Math.max(0, totalSeconds) / 60); const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}min` : `${minutes}min`; }
function formatBytes(bytes: number) { if (!bytes) return '—'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = bytes; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; } return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`; }
function formatSyncTime(value: string) { if (!value) return '—'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function itemId(file: File) { return `${(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}-${file.size}-${file.lastModified}`; }
function isIgnoredFile(file: File) { const path = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name || ''); const name = file.name || ''; return name.startsWith('._') || name === '.DS_Store' || path.includes('/._') || path.includes('/.DS_Store'); }
async function xhrPut(url: string, file: File, onProgress: (n: number) => void) { await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('PUT', url); if (file.type) xhr.setRequestHeader('Content-Type', file.type); xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100)); xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou (${xhr.status}).`)); xhr.onerror = () => reject(new Error('Upload interrompido.')); xhr.send(file); }); }
async function xhrPostFile(url: string, file: File, onProgress: (n: number) => void) { await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); const form = new FormData(); form.append('file', file, file.name); xhr.open('POST', url); xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100)); xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou (${xhr.status}).`)); xhr.onerror = () => reject(new Error('Upload interrompido.')); xhr.send(form); }); }

export function AdminMediaUploader({ productId, productName, modules = [], migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: Props = {}) {
  const firstModule = modules[0]?.id || '';
  const [destinationModuleId, setDestinationModuleId] = useState(firstModule);
  const [uploadDestination, setUploadDestination] = useState<UploadDestination>('stream');
  const [auxiliaryVideo, setAuxiliaryVideo] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
  const [streamRunning, setStreamRunning] = useState(false);
  const [r2Items, setR2Items] = useState<R2Item[]>([]);
  const [r2Running, setR2Running] = useState(false);
  const streamFileInputRef = useRef<HTMLInputElement | null>(null);
  const streamFolderInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const streamItemsRef = useRef<StreamItem[]>([]);
  const r2ItemsRef = useRef<R2Item[]>([]);
  const streamRunningRef = useRef(false);
  const r2RunningRef = useRef(false);
  const selectedModule = modules.find((module) => module.id === destinationModuleId);

  useEffect(() => { streamItemsRef.current = streamItems; }, [streamItems]);
  useEffect(() => { r2ItemsRef.current = r2Items; }, [r2Items]);

  const streamStats = useMemo(() => {
    const total = streamItems.length;
    const done = streamItems.filter((item) => item.status === 'done' || item.status === 'linked').length;
    const linked = streamItems.filter((item) => item.status === 'linked').length;
    const failed = streamItems.filter((item) => item.status === 'error').length;
    const overall = total ? Math.round(streamItems.reduce((sum, item) => sum + item.progress, 0) / total) : 0;
    return { total, done, linked, failed, overall };
  }, [streamItems]);

  const r2Stats = useMemo(() => {
    const total = r2Items.length;
    const done = r2Items.filter((item) => item.status === 'done' || item.status === 'linked').length;
    const linked = r2Items.filter((item) => item.status === 'linked').length;
    const failed = r2Items.filter((item) => item.status === 'error').length;
    const overall = total ? Math.round(r2Items.reduce((sum, item) => sum + item.progress, 0) / total) : 0;
    return { total, done, linked, failed, overall };
  }, [r2Items]);

  function setR2Item(id: string, patch: Partial<R2Item>) { setR2Items((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function setStreamItem(id: string, patch: Partial<StreamItem>) { setStreamItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }

  function addStreamFiles(files: FileList | null) {
    const nextFiles = Array.from(files || []).filter((file) => !isIgnoredFile(file) && (file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name)));
    if (!nextFiles.length) return;
    setStreamItems((current) => {
      const map = new Map(current.map((item) => [item.id, item]));
      nextFiles.forEach((file) => {
        const id = itemId(file);
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const previous = map.get(id);
        map.set(id, { id, file, name: file.name, relativePath, type: file.type || 'video', size: file.size, status: previous?.status === 'linked' || previous?.status === 'done' ? previous.status : 'queued', progress: previous?.progress || 0, attempts: previous?.attempts || 0, url: previous?.url, uid: previous?.uid, error: previous?.error });
      });
      return Array.from(map.values());
    });
    if (streamRunningRef.current) window.setTimeout(() => runStreamQueue(), 0);
  }

  function addR2Files(files: FileList | null) {
    const nextFiles = Array.from(files || []).filter((file) => !isIgnoredFile(file));
    if (!nextFiles.length) return;
    setR2Items((current) => {
      const map = new Map(current.map((item) => [item.id, item]));
      nextFiles.forEach((file) => {
        const id = itemId(file);
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const previous = map.get(id);
        map.set(id, { id, file, name: file.name, relativePath, type: file.type || 'arquivo', size: file.size, status: previous?.status === 'linked' || previous?.status === 'done' ? previous.status : 'queued', progress: previous?.progress || 0, attempts: previous?.attempts || 0, url: previous?.url, error: previous?.error });
      });
      return Array.from(map.values());
    });
    if (r2RunningRef.current) window.setTimeout(() => runR2Queue(), 0);
  }

  async function syncStream() {
    if (!productId || !destinationModuleId) return;
    setSyncing(true); setSyncError(''); setSyncResult(null);
    try {
      const response = await fetch('/api/admin/media/stream-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, moduleId: destinationModuleId }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.message || 'Não foi possível importar vídeos do Stream.');
      setSyncResult(json);
    } catch (err) { setSyncError(err instanceof Error ? err.message : 'Erro desconhecido ao sincronizar.'); }
    setSyncing(false);
  }

  async function uploadOneStream(item: StreamItem) {
    if (!productId || !destinationModuleId) { setStreamItem(item.id, { status: 'error', error: 'Selecione produto e módulo de destino.' }); return; }
    let attempt = item.attempts || 0;
    while (attempt < RETRY_LIMIT) {
      try {
        attempt += 1;
        setStreamItem(item.id, { status: 'uploading', progress: Math.max(item.progress || 0, 1), attempts: attempt, error: '' });
        const response = await fetch('/api/admin/media/stream-upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: item.name, contentType: item.file.type || 'video/mp4', relativePath: item.relativePath, productId, moduleId: destinationModuleId, size: item.size }) });
        const signed = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload no Stream.');
        await xhrPostFile(signed.uploadUrl, item.file, (progress) => setStreamItem(item.id, { progress, attempts: attempt, uid: signed.uid }));
        const completed = await fetch('/api/admin/media/stream-complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, moduleId: destinationModuleId, title: item.name, uid: signed.uid, relativePath: item.relativePath, size: item.size }) });
        const completedJson = await completed.json().catch(() => ({}));
        if (!completed.ok) throw new Error(completedJson?.message || 'Vídeo enviado, mas não foi salvo na biblioteca.');
        setStreamItem(item.id, { status: completedJson?.linked ? 'linked' : 'done', progress: 100, attempts: attempt, uid: signed.uid, url: `https://iframe.videodelivery.net/${signed.uid}`, error: '' });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido ao enviar.';
        setStreamItem(item.id, { status: 'error', error: `${message} · tentativa ${attempt}/${RETRY_LIMIT}`, attempts: attempt, progress: 0 });
        if (attempt >= RETRY_LIMIT) return;
        await sleep(RETRY_DELAYS[attempt - 1] || 35000);
      }
    }
  }

  async function uploadOneR2(item: R2Item) {
    if (!destinationModuleId) { setR2Item(item.id, { status: 'error', error: 'Selecione o módulo de destino.' }); return; }
    const mediaType = inferMediaType(item.file);
    if (item.file.type.startsWith('video/') && !auxiliaryVideo) { setR2Item(item.id, { status: 'error', error: 'Vídeos principais devem ir para o Cloudflare Stream. Marque como arquivo auxiliar para enviar ao R2.' }); return; }

    let attempt = item.attempts || 0;
    while (attempt < RETRY_LIMIT) {
      try {
        attempt += 1;
        setR2Item(item.id, { status: 'uploading', progress: Math.max(item.progress || 0, 1), attempts: attempt, error: '' });
        const response = await fetch('/api/admin/media/signed-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: item.name, contentType: item.file.type || 'application/octet-stream', relativePath: item.relativePath, productId, moduleId: destinationModuleId, mediaType, auxiliaryVideo }),
        });
        const signed: UploadResult & { message?: string; error?: string } = await response.json();
        if (!response.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload.');
        await xhrPut(signed.uploadUrl, item.file, (progress) => setR2Item(item.id, { progress, attempts: attempt }));
        const completed = await fetch('/api/admin/media/complete-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, moduleId: destinationModuleId, title: item.name, r2Url: signed.publicUrl, mediaType, key: signed.key, relativePath: item.relativePath }),
        });
        const completedJson = await completed.json().catch(() => ({}));
        if (!completed.ok) throw new Error(completedJson?.message || 'Arquivo enviado, mas não foi salvo na biblioteca.');
        setR2Item(item.id, { status: completedJson?.linked ? 'linked' : 'done', progress: 100, attempts: attempt, url: signed.publicUrl, error: '' });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido ao enviar.';
        setR2Item(item.id, { status: 'error', error: `${message} · tentativa ${attempt}/${RETRY_LIMIT}`, attempts: attempt, progress: 0 });
        if (attempt >= RETRY_LIMIT) return;
        await sleep(RETRY_DELAYS[attempt - 1] || 35000);
      }
    }
  }

  async function runStreamQueue(onlyFailed = false) {
    if (streamRunningRef.current) return;
    const hasQueue = streamItemsRef.current.some((item) => onlyFailed ? item.status === 'error' : item.status === 'queued' || item.status === 'error');
    if (!hasQueue) return;
    streamRunningRef.current = true; setStreamRunning(true);
    while (true) {
      const item = streamItemsRef.current.find((candidate) => onlyFailed ? candidate.status === 'error' : candidate.status === 'queued');
      if (!item) break;
      const retryItem = onlyFailed ? { ...item, attempts: 0, progress: 0 } : item;
      if (onlyFailed) setStreamItem(item.id, { attempts: 0, progress: 0, status: 'queued', error: '' });
      await uploadOneStream(retryItem);
    }
    streamRunningRef.current = false; setStreamRunning(false);
  }

  async function runR2Queue(onlyFailed = false) {
    if (r2RunningRef.current) return;
    const hasQueue = r2ItemsRef.current.some((item) => onlyFailed ? item.status === 'error' : item.status === 'queued' || item.status === 'error');
    if (!hasQueue) return;
    r2RunningRef.current = true; setR2Running(true);
    while (true) {
      const item = r2ItemsRef.current.find((candidate) => onlyFailed ? candidate.status === 'error' : candidate.status === 'queued');
      if (!item) break;
      const retryItem = onlyFailed ? { ...item, attempts: 0, progress: 0 } : item;
      if (onlyFailed) setR2Item(item.id, { attempts: 0, progress: 0, status: 'queued', error: '' });
      await uploadOneR2(retryItem);
    }
    r2RunningRef.current = false; setR2Running(false);
  }

  if (migrationOnly) return <section className="media-migration-compact"><div><span className="admin-clean-eyebrow">Mídia do produto</span><strong>Biblioteca organizada</strong><p className="admin-clean-muted">Vídeos principais via Stream; materiais auxiliares via R2, sempre por módulo.</p></div><a className="admin-clean-button primary" href={productId ? `/admin/produtos/${productId}?tab=midia` : '#'}>Abrir Mídia</a></section>;

  return <>
    <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Destino da biblioteca</p><h2>{productName || 'Produto'}</h2><p className="muted">Escolha o módulo e depois a biblioteca: Stream para vídeos das aulas, R2 para materiais auxiliares.</p></div><span className="admin-clean-pill warning">{selectedModule?.title || 'Selecione um módulo'}</span></div>
      <div className="admin-form-grid"><label>Módulo dentro do produto<select value={destinationModuleId} onChange={(event) => setDestinationModuleId(event.target.value)} required><option value="">Selecione o módulo</option>{modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}</select></label></div>
      <div className="admin-help-box"><strong>Destino desta importação</strong><p className="muted">Stream envia vídeos pelo caminho oficial de upload direto e também pode sincronizar vídeos já existentes no painel Cloudflare. R2 faz upload de arquivos auxiliares.</p><div className="media-migration-toolbar"><button className={`admin-clean-button ${uploadDestination === 'stream' ? 'primary' : 'secondary'}`} type="button" onClick={() => setUploadDestination('stream')}><Video size={16} /> Upload Stream</button><button className={`admin-clean-button ${uploadDestination === 'r2' ? 'primary' : 'secondary'}`} type="button" onClick={() => setUploadDestination('r2')}><UploadCloud size={16} /> Upload para R2</button></div></div>
    </section>

    {uploadDestination === 'stream' ? <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Cloudflare Stream</p><h2>Importar vídeos das aulas</h2><p className="muted">Envie vídeos para o Cloudflare Stream com fila, pastas e reenvio automático. Se preferir, sincronize vídeos já enviados no painel.</p></div><span className={`admin-clean-pill ${streamStats.failed || syncError ? 'danger' : streamStats.done || syncResult ? 'success' : streamRunning ? 'success' : 'warning'}`}>{streamRunning ? 'Enviando...' : syncing ? 'Importando...' : streamStats.done || syncResult ? 'Ativo' : 'Pronto'}</span></div>
      <div className="admin-grid admin-section"><article className="admin-stat"><span>Aulas</span><strong>{totalLessons}</strong><p className="muted">Conteúdos do produto.</p></article><article className="admin-stat"><span>Drive atual</span><strong>{driveLessons}</strong><p className="muted">Aguardam Stream.</p></article><article className="admin-stat"><span>Otimizadas</span><strong>{migratedLessons}</strong><p className="muted">Já têm origem interna.</p></article></div>
      <div className="admin-grid admin-section"><article className="admin-stat"><span>Fila Stream</span><strong>{streamStats.total}</strong><p className="muted">Vídeos selecionados.</p></article><article className="admin-stat"><span>Enviados</span><strong>{streamStats.done}</strong><p className="muted">Salvos no Stream.</p></article><article className="admin-stat"><span>Vinculados</span><strong>{streamStats.linked}</strong><p className="muted">Ligados a aulas pelo nome.</p></article></div>
      {streamItems.length ? <div className="progress media-migration-progress"><span style={{ width: `${streamStats.overall}%` }} /></div> : null}
      <div className="media-migration-toolbar"><input ref={streamFileInputRef} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple style={{ display: 'none' }} onChange={(event) => addStreamFiles(event.target.files)} /><input ref={streamFolderInputRef} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} style={{ display: 'none' }} onChange={(event) => addStreamFiles(event.target.files)} /><button className="admin-clean-button secondary" type="button" onClick={() => streamFileInputRef.current?.click()}>Importar vídeos</button><button className="admin-clean-button secondary" type="button" onClick={() => streamFolderInputRef.current?.click()}><FolderUp size={16} /> Importar pasta</button><button className="admin-clean-button primary" type="button" onClick={() => runStreamQueue(false)} disabled={streamRunning || !destinationModuleId || !streamItems.some((item) => item.status === 'queued' || item.status === 'error')}>{streamRunning ? <><Loader2 size={16} className="premium-video-spinner" /> Enviando {streamStats.overall}%</> : <><UploadCloud size={16} /> Enviar para Stream</>}</button><button className="admin-clean-button secondary" type="button" onClick={syncStream} disabled={syncing || streamRunning || !productId || !destinationModuleId}>{syncing ? <><Loader2 size={16} className="premium-video-spinner" /> Sincronizando...</> : <><RefreshCw size={16} /> Sincronizar existentes</>}</button><button className="admin-clean-button secondary" type="button" onClick={() => setStreamItems([])} disabled={streamRunning}>Limpar fila</button></div>
      <div className="admin-help-box"><strong><Video size={16} /> Como usar</strong><p className="muted">Selecione vídeos ou uma pasta inteira, mantenha nomes parecidos com as aulas e clique em enviar. Novos arquivos adicionados durante o envio entram na mesma fila. Falhas tentam até {RETRY_LIMIT}/5 vezes.</p></div>
      {streamStats.failed ? <button className="admin-clean-button secondary" type="button" onClick={() => runStreamQueue(true)} disabled={streamRunning}>Reenviar falhas</button> : null}
      {streamItems.length ? <div className="admin-list media-migration-results">{streamItems.slice(0, 160).map((item) => <div className="admin-row" key={item.id}><div><span className={`admin-clean-pill ${item.status === 'linked' || item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}`}>{item.status === 'linked' ? <><Check size={14} /> Vinculado</> : item.status === 'done' ? <><Check size={14} /> Salvo</> : item.status === 'error' ? <><XCircle size={14} /> Falhou</> : item.status === 'uploading' ? 'Enviando' : 'Na fila'}</span><h3>{item.name}</h3><p className="muted">{item.relativePath} · {formatBytes(item.size)} · tentativas {item.attempts}/{RETRY_LIMIT}{item.uid ? ` · UID ${item.uid}` : ''}{item.error ? ` · ${item.error}` : ''}</p></div><strong>{item.progress}%</strong></div>)}</div> : null}
      {syncError ? <p className="admin-save-error">{syncError}</p> : null}
      {syncResult ? <div className="admin-list media-migration-results"><div className="admin-row"><div><h3>Resultado da sincronização</h3><div className="stream-sync-summary"><span>{syncResult.total} vídeos encontrados</span><span>{syncResult.linked} vinculados</span><span className={syncResult.unmatchedCount ? 'warning' : ''}>{syncResult.unmatchedCount} sem correspondência</span><span>duração <strong>{formatDuration(syncResult.durationSeconds)}</strong></span><span>espaço <strong>{formatBytes(syncResult.sizeBytes)}</strong></span><span>última sincronização <strong>{formatSyncTime(syncResult.syncedAt)}</strong></span>{syncResult.errorsCount ? <span className="danger">{syncResult.errorsCount} erros</span> : null}</div></div></div>{syncResult.unmatched?.map((item) => <div className="admin-row" key={item.uid}><div><span className="admin-clean-pill warning">Sem correspondência</span><h3>{item.name}</h3><p className="muted">UID: {item.uid} · {item.status}</p></div></div>)}{syncResult.errors?.map((item) => <div className="admin-row" key={`${item.uid}-error`}><div><span className="admin-clean-pill danger">Erro</span><h3>{item.name}</h3><p className="muted">UID: {item.uid} · {item.message}</p></div></div>)}</div> : null}
    </section> : null}

    {uploadDestination === 'r2' ? <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Cloudflare R2</p><h2>Upload de materiais auxiliares</h2><p className="muted">Envie áudios, ebooks, PDFs, capas, imagens e extras para o módulo escolhido. Você pode adicionar mais arquivos enquanto a fila está enviando.</p></div><span className={`admin-clean-pill ${r2Stats.failed ? 'danger' : r2Stats.done ? 'success' : r2Running ? 'success' : 'warning'}`}>{r2Running ? 'Enviando...' : r2Stats.done ? 'Uploads salvos' : 'Pronto'}</span></div>
      <div className="admin-grid admin-section"><article className="admin-stat"><span>Na fila</span><strong>{r2Stats.total}</strong><p className="muted">Arquivos selecionados.</p></article><article className="admin-stat"><span>Enviados</span><strong>{r2Stats.done}</strong><p className="muted">Salvos no R2.</p></article><article className="admin-stat"><span>Vinculados</span><strong>{r2Stats.linked}</strong><p className="muted">Ligados a aulas pelo nome.</p></article></div>
      {r2Items.length ? <div className="progress media-migration-progress"><span style={{ width: `${r2Stats.overall}%` }} /></div> : null}
      <div className="admin-help-box"><strong>R2 é para material auxiliar</strong><p className="muted">Vídeos principais do curso ficam no Stream. Marque a opção abaixo apenas se o vídeo for um arquivo auxiliar.</p><label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 12 }}><input type="checkbox" checked={auxiliaryVideo} onChange={(event) => setAuxiliaryVideo(event.target.checked)} /> Permitir vídeo como arquivo auxiliar no R2</label></div>
      <div className="media-migration-toolbar"><input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(event) => addR2Files(event.target.files)} /><input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} style={{ display: 'none' }} onChange={(event) => addR2Files(event.target.files)} /><button className="admin-clean-button secondary" type="button" onClick={() => fileInputRef.current?.click()}>Importar arquivo</button><button className="admin-clean-button secondary" type="button" onClick={() => folderInputRef.current?.click()}><FolderUp size={16} /> Importar pasta</button><button className="admin-clean-button primary" type="button" onClick={() => runR2Queue(false)} disabled={r2Running || !destinationModuleId || !r2Items.some((item) => item.status === 'queued' || item.status === 'error')}>{r2Running ? <><Loader2 size={16} className="premium-video-spinner" /> Enviando {r2Stats.overall}%</> : <><UploadCloud size={16} /> Enviar para R2</>}</button><button className="admin-clean-button secondary" type="button" onClick={() => setR2Items([])} disabled={r2Running}>Limpar fila</button></div>
      <div className="admin-help-box"><strong>Dica importante</strong><p className="muted">Arquivos iniciados por <code>._</code> e <code>.DS_Store</code> são ignorados automaticamente. Falhas tentam até {RETRY_LIMIT} vezes.</p></div>
      {r2Stats.failed ? <button className="admin-clean-button secondary" type="button" onClick={() => runR2Queue(true)} disabled={r2Running}>Reenviar falhas</button> : null}
      {r2Items.length ? <div className="admin-list media-migration-results">{r2Items.slice(0, 160).map((item) => <div className="admin-row" key={item.id}><div><span className={`admin-clean-pill ${item.status === 'linked' || item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}`}>{item.status === 'linked' ? <><Check size={14} /> Vinculado</> : item.status === 'done' ? <><Check size={14} /> Salvo</> : item.status === 'error' ? <><XCircle size={14} /> Falhou</> : item.status === 'uploading' ? 'Enviando' : 'Na fila'}</span><h3>{item.name}</h3><p className="muted">{item.relativePath} · {formatBytes(item.size)} · tentativas {item.attempts}/{RETRY_LIMIT}{item.url ? ` · ${item.url}` : ''}{item.error ? ` · ${item.error}` : ''}</p></div><strong>{item.progress}%</strong></div>)}</div> : null}
    </section> : null}
  </>;
}
