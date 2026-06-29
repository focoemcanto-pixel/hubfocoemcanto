'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, FolderUp, Loader2, RefreshCw, UploadCloud, XCircle } from 'lucide-react';
import { sha256File } from '@/lib/media/client-file-hash';

type ModuleOption = { id: string; title: string; slug?: string | null };
type Props = { productId?: string; productName?: string | null; modules?: ModuleOption[]; migrationOnly?: boolean; totalLessons?: number; migratedLessons?: number; driveLessons?: number };
type Status = 'queued' | 'uploading' | 'linked' | 'done' | 'error';
type Item = { id: string; file: File; name: string; relativePath: string; size: number; status: Status; progress: number; attempts: number; uid?: string; error?: string; url?: string };
type UploadResult = { key: string; publicUrl: string; uploadUrl: string; message?: string; error?: string };
type StreamCreate = { uid?: string; uploadUrl?: string; uploadURL?: string; formField?: string; message?: string; error?: string };
type StreamDone = { linked?: boolean; createdExercise?: boolean; message?: string; error?: string };
type StreamStatus = { state?: string; received?: boolean; ready?: boolean; duration?: number | null; message?: string; error?: string };
type SyncResult = { linked?: number; unmatchedCount?: number; unmatched?: Array<{ uid: string; name: string; status: string }>; exercises?: Array<{ id: string; title?: string | null }>; message?: string; error?: string };
type FolderMapItem = { fileName: string; relativePath: string; action: string; reason: string; exerciseTitle?: string | null; streamUid?: string | null };
type FolderMapResult = { totalFiles?: number; uploadCount?: number; skipCount?: number; validStreamCount?: number; brokenStreamCount?: number; missingStreamCount?: number; newLessonCount?: number; mapped?: FolderMapItem[]; message?: string; error?: string };

const RETRY_LIMIT = 5;
const retryDelay = [2000, 5000, 10000, 20000, 35000];
const uploadActions = new Set(['upload_missing_stream', 'upload_broken_stream', 'upload_new_lesson']);
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
function formatBytes(bytes: number) { if (!bytes) return '—'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = bytes; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; } return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`; }
function relPath(file: File) { return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name; }
function itemId(file: File) { return `${relPath(file)}-${file.size}-${file.lastModified}`; }
function isVideo(file: File) { return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name); }
function mediaType(file: File) { if (file.type.startsWith('audio/')) return 'audio'; if (file.type.startsWith('image/')) return 'image'; return 'file'; }
function ignored(file: File) { const path = relPath(file); return file.name === '.DS_Store' || file.name.startsWith('._') || path.includes('/.DS_Store') || path.includes('/._'); }
function toItem(file: File): Item { return { id: itemId(file), file, name: file.name, relativePath: relPath(file), size: file.size, status: 'queued', progress: 0, attempts: 0 }; }
function folderBadge(item: FolderMapItem) { if (item.action === 'skip_valid_stream') return { label: 'Ignorar', tone: 'success' }; if (item.action === 'upload_broken_stream') return { label: 'Reenviar', tone: 'danger' }; if (item.action === 'upload_missing_stream') return { label: 'Enviar', tone: 'warning' }; if (item.action === 'upload_new_lesson') return { label: 'Criar aula', tone: 'warning' }; return { label: 'Sem ação', tone: 'warning' }; }

async function readLocalDuration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('Não foi possível ler a duração do vídeo.')); });
    return Number.isFinite(video.duration) ? video.duration : 0;
  } finally { URL.revokeObjectURL(url); }
}

async function xhrPostForm(url: string, file: File, field = 'file', onProgress?: (progress: number) => void) {
  const form = new FormData();
  form.append(field || 'file', file, file.name);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(Math.round((event.loaded / event.total) * 100));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error((xhr.responseText || '').trim() || `Upload Stream falhou (${xhr.status}).`));
    xhr.onerror = () => reject(new Error('Upload Stream interrompido. O arquivo não foi confirmado pelo navegador.'));
    xhr.onabort = () => reject(new Error('Upload Stream abortado.'));
    xhr.send(form);
  });
}

async function xhrPut(url: string, file: File, onProgress: (value: number) => void) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error((xhr.responseText || '').trim() || `Upload falhou (${xhr.status}).`));
    xhr.onerror = () => reject(new Error('Upload interrompido pela conexão.'));
    xhr.send(file);
  });
}

async function waitForReady(uid: string, originalDuration: number, update: (message: string, progress: number) => void) {
  for (let i = 0; i < 120; i += 1) {
    await sleep(i === 0 ? 5000 : 5000);
    const response = await fetch(`/api/admin/media/stream-status?uid=${encodeURIComponent(uid)}`, { cache: 'no-store' });
    const json: StreamStatus = await response.json().catch(() => ({}));
    if (!response.ok || json.error) throw new Error(json.message || json.error || 'Não foi possível confirmar o status no Cloudflare.');
    const state = String(json.state || 'unknown');
    const duration = Number(json.duration || 0) || 0;
    if (json.ready || json.received) {
      if (originalDuration > 0 && duration > 0 && duration < originalDuration * 0.95) throw new Error(`Cloudflare recebeu vídeo incompleto: ${Math.round(duration)}s de ${Math.round(originalDuration)}s. Exclua esse UID no Stream e reenvie.`);
      update(`Cloudflare confirmou vídeo pronto. Duração: ${Math.round(duration)}s.`, 95);
      return;
    }
    update(`Aguardando processamento completo no Cloudflare... (${state})`, Math.min(93, 65 + Math.round(i * 0.25)));
  }
  throw new Error('Cloudflare não confirmou o vídeo como pronto. O Hub não vinculou para evitar vídeo incompleto.');
}

export function AdminMediaUploader({ productId, productName, modules = [], migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: Props = {}) {
  const [moduleId, setModuleId] = useState(modules[0]?.id || '');
  const [createMissingLessons, setCreateMissingLessons] = useState(true);
  const [auxiliaryVideo, setAuxiliaryVideo] = useState(false);
  const [streamItems, setStreamItems] = useState<Item[]>([]);
  const [r2Items, setR2Items] = useState<Item[]>([]);
  const [streamRunning, setStreamRunning] = useState(false);
  const [r2Running, setR2Running] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [folderMap, setFolderMap] = useState<FolderMapResult | null>(null);
  const [showFolderDetails, setShowFolderDetails] = useState(false);
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({});
  const streamFile = useRef<HTMLInputElement | null>(null);
  const streamFolder = useRef<HTMLInputElement | null>(null);
  const r2File = useRef<HTMLInputElement | null>(null);
  const r2Folder = useRef<HTMLInputElement | null>(null);
  const selectedModule = modules.find((item) => item.id === moduleId);
  const streamStats = useMemo(() => stats(streamItems), [streamItems]);
  const r2Stats = useMemo(() => stats(r2Items), [r2Items]);

  function stats(items: Item[]) { const done = items.filter((item) => item.status === 'done' || item.status === 'linked').length; const linked = items.filter((item) => item.status === 'linked').length; const failed = items.filter((item) => item.status === 'error').length; const progress = items.length ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length) : 0; return { total: items.length, done, linked, failed, progress }; }
  function patchStream(id: string, patch: Partial<Item>) { setStreamItems((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function patchR2(id: string, patch: Partial<Item>) { setR2Items((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function mergeItems(current: Item[], files: File[], target: 'stream' | 'r2') { const map = new Map(current.map((item) => [item.id, item])); files.forEach((file) => { const invalid = target === 'stream' && !isVideo(file); const previous = map.get(itemId(file)); map.set(itemId(file), { ...toItem(file), status: invalid ? 'error' : (previous?.status === 'linked' || previous?.status === 'done' ? previous.status : 'queued'), progress: previous?.progress || 0, attempts: previous?.attempts || 0, uid: previous?.uid, url: previous?.url, error: invalid ? 'O Stream aceita apenas vídeos.' : previous?.error }); }); return Array.from(map.values()); }
  function add(files: FileList | null, target: 'stream' | 'r2') { const picked = Array.from(files || []).filter((file) => !ignored(file)); if (target === 'stream') { setStreamItems((current) => mergeItems(current, picked, 'stream')); setFolderMap(null); } else setR2Items((current) => mergeItems(current, picked, 'r2')); }

  async function mapFolder(files: FileList | null) {
    const picked = Array.from(files || []).filter((file) => !ignored(file) && isVideo(file));
    if (!picked.length) return;
    if (!productId || !moduleId) { setSyncMessage('Selecione produto e módulo antes de mapear a pasta.'); return; }
    setMapping(true); setSyncMessage('Mapeando pasta e validando vídeos existentes...'); setFolderMap(null); setShowFolderDetails(false);
    try {
      const response = await fetch('/api/admin/media/stream-folder-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, moduleId, createMissing: createMissingLessons, files: picked.map((file) => ({ name: file.name, relativePath: relPath(file), size: file.size, type: file.type })) }) });
      const json: FolderMapResult = await response.json().catch(() => ({}));
      if (!response.ok || json.error) throw new Error(json.message || json.error || 'Não foi possível mapear a pasta.');
      const needed = new Set((json.mapped || []).filter((item) => uploadActions.has(item.action)).flatMap((item) => [item.relativePath, item.fileName]));
      const pendingFiles = picked.filter((file) => needed.has(relPath(file)) || needed.has(file.name));
      setStreamItems(pendingFiles.map(toItem)); setFolderMap(json);
      setSyncMessage(`${json.totalFiles || 0} analisados · ${json.uploadCount || 0} pendentes na fila · ${json.validStreamCount || 0} ignorados por já estarem OK.`);
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Erro ao mapear pasta.'); }
    setMapping(false);
  }

  async function uploadStreamItem(item: Item) {
    if (!productId || !moduleId) { patchStream(item.id, { status: 'error', error: 'Selecione produto e módulo.' }); return; }
    let attempts = item.attempts || 0;
    while (attempts < RETRY_LIMIT) {
      try {
        attempts += 1;
        const originalDuration = await readLocalDuration(item.file).catch(() => 0);
        if (!originalDuration || originalDuration <= 0) { patchStream(item.id, { status: 'error', progress: 0, attempts, error: 'Não foi possível validar a duração local deste vídeo.' }); return; }
        const fileHash = await sha256File(item.file).catch(() => '');
        patchStream(item.id, { status: 'uploading', progress: 10, attempts, error: 'Criando URL segura no Cloudflare...' });
        const create = await fetch('/api/admin/media/stream-upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: item.name, contentType: item.file.type || 'video/mp4', productId, moduleId, relativePath: item.relativePath, size: item.file.size, originalSize: item.file.size, fileHash, compressionProfile: 'none', forceNewUpload: true }) });
        const created: StreamCreate = await create.json().catch(() => ({}));
        if (!create.ok || created.error) throw new Error(created.message || created.error || 'Não foi possível criar upload no Stream.');
        const uid = created.uid || '';
        const uploadUrl = created.uploadUrl || created.uploadURL || '';
        if (!uid || !uploadUrl) throw new Error('Cloudflare não retornou UID/uploadURL.');
        patchStream(item.id, { progress: 20, uid, error: 'Enviando com confirmação real do navegador...' });
        await xhrPostForm(uploadUrl, item.file, created.formField || 'file', (progress) => patchStream(item.id, { uid, status: 'uploading', progress: Math.min(80, 20 + Math.round(progress * 0.6)), error: `Upload confirmado: ${progress}%` }));
        await waitForReady(uid, originalDuration, (message, progress) => patchStream(item.id, { uid, progress, error: message }));
        const complete = await fetch('/api/admin/media/stream-complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, moduleId, title: item.name, uid, relativePath: item.relativePath, size: item.file.size, createMissing: createMissingLessons, fileHash, originalSize: item.file.size, compressionProfile: 'none' }) });
        const done: StreamDone = await complete.json().catch(() => ({}));
        if (!complete.ok || done.error) throw new Error(done.message || done.error || 'Vídeo enviado, mas não foi salvo no módulo.');
        patchStream(item.id, { status: done.linked ? 'linked' : 'done', progress: 100, attempts, uid, error: done.createdExercise ? 'Aula criada automaticamente.' : 'Arquivo original vinculado.' }); return;
      } catch (error) { const message = error instanceof Error ? error.message : 'Erro desconhecido.'; patchStream(item.id, { status: 'error', progress: 0, attempts, error: `${message} · tentativa ${attempts}/${RETRY_LIMIT}` }); if (attempts >= RETRY_LIMIT) return; await sleep(retryDelay[attempts - 1] || 35000); }
    }
  }

  async function uploadR2Item(item: Item) { if (!productId || !moduleId) { patchR2(item.id, { status: 'error', error: 'Selecione produto e módulo.' }); return; } if (isVideo(item.file) && !auxiliaryVideo) { patchR2(item.id, { status: 'error', error: 'Vídeos principais devem ir para o Stream. Marque como auxiliar para R2.' }); return; } let attempts = item.attempts || 0; while (attempts < RETRY_LIMIT) { try { attempts += 1; patchR2(item.id, { status: 'uploading', attempts, progress: 1, error: '' }); const response = await fetch('/api/admin/media/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: item.name, contentType: item.file.type || 'application/octet-stream', relativePath: item.relativePath, productId, moduleId, mediaType: mediaType(item.file), auxiliaryVideo }) }); const signed: UploadResult = await response.json(); if (!response.ok) throw new Error(signed.message || signed.error || 'Não foi possível preparar upload R2.'); await xhrPut(signed.uploadUrl, item.file, (progress) => patchR2(item.id, { progress, attempts })); await fetch('/api/admin/media/complete-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, moduleId, title: item.name, r2Url: signed.publicUrl, mediaType: mediaType(item.file), key: signed.key, relativePath: item.relativePath }) }); patchR2(item.id, { status: 'done', progress: 100, attempts, url: signed.publicUrl }); return; } catch (error) { const message = error instanceof Error ? error.message : 'Erro desconhecido.'; patchR2(item.id, { status: 'error', progress: 0, attempts, error: `${message} · tentativa ${attempts}/${RETRY_LIMIT}` }); if (attempts >= RETRY_LIMIT) return; await sleep(retryDelay[attempts - 1] || 35000); } } }
  async function runStreamQueue(onlyFailed = false) { if (streamRunning) return; setStreamRunning(true); const queue = streamItems.filter((item) => onlyFailed ? item.status === 'error' : item.status === 'queued' || item.status === 'error'); for (const item of queue) { if (onlyFailed) patchStream(item.id, { attempts: 0, progress: 0, status: 'queued', error: '' }); await uploadStreamItem(onlyFailed ? { ...item, attempts: 0 } : item); await sleep(3000); } setStreamRunning(false); }
  async function runR2Queue(onlyFailed = false) { if (r2Running) return; setR2Running(true); const queue = r2Items.filter((item) => onlyFailed ? item.status === 'error' : item.status === 'queued' || item.status === 'error'); for (const item of queue) { if (onlyFailed) patchR2(item.id, { attempts: 0, progress: 0, status: 'queued', error: '' }); await uploadR2Item(onlyFailed ? { ...item, attempts: 0 } : item); } setR2Running(false); }
  async function syncStream() { if (!productId || !moduleId) return; setSyncing(true); setSyncMessage(''); try { const response = await fetch('/api/admin/media/stream-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, moduleId }) }); const json: SyncResult = await response.json().catch(() => ({})); if (!response.ok || json.error) throw new Error(json.message || json.error || 'Erro na sincronização.'); setSyncResult(json); setSyncMessage(`${json.linked || 0} vinculados · ${json.unmatchedCount || 0} sem correspondência`); } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Erro ao sincronizar.'); } setSyncing(false); }
  async function linkUnmatched(uid: string) { const exerciseId = manualLinks[uid]; if (!productId || !moduleId || !exerciseId) return; setSyncing(true); try { const response = await fetch('/api/admin/media/stream-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, moduleId, manualLinks: [{ uid, exerciseId }] }) }); const json: SyncResult = await response.json().catch(() => ({})); if (!response.ok || json.error) throw new Error(json.message || json.error || 'Erro ao vincular vídeo.'); setSyncResult(json); setSyncMessage(`Vínculo manual salvo. ${json.unmatchedCount || 0} sem correspondência`); } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Erro ao vincular vídeo.'); } setSyncing(false); }

  if (migrationOnly) return <section className="media-migration-compact"><div><span className="admin-clean-eyebrow">Mídia do produto</span><strong>Biblioteca organizada</strong><p className="admin-clean-muted">Upload Stream com confirmação real e R2 auxiliar por módulo.</p></div><a className="admin-clean-button primary" href={productId ? `/admin/produtos/${productId}?tab=midia` : '#'}>Abrir Mídia</a></section>;
  return <><section className="card admin-section media-migration-card"><div className="section-heading"><div><p className="eyebrow">Destino da biblioteca</p><h2>{productName || 'Produto'} · Mídia premium</h2><p className="muted">Escolha o módulo. Ao selecionar pasta, o Hub filtra automaticamente só os pendentes.</p></div><span className="admin-clean-pill warning">{selectedModule?.title || 'Selecione um módulo'}</span></div><div className="admin-form-grid"><label>Módulo dentro do produto<select value={moduleId} onChange={(event) => { setModuleId(event.target.value); setFolderMap(null); setStreamItems([]); }}><option value="">Selecione o módulo</option>{modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select></label></div></section><section className="card admin-section media-migration-card"><div className="section-heading"><div><p className="eyebrow">Cloudflare Stream</p><h2>Upload de vídeos das aulas</h2><p className="muted">Upload original com XMLHttpRequest, progresso real e validação de duração antes de vincular.</p></div><span className={`admin-clean-pill ${streamStats.failed ? 'danger' : streamStats.done ? 'success' : streamRunning ? 'success' : mapping ? 'success' : 'warning'}`}>{mapping ? 'Mapeando...' : streamRunning ? 'Enviando...' : streamStats.done ? 'Uploads salvos' : 'Pronto'}</span></div><div className="admin-help-box"><strong>Modo seguro ativado</strong><p className="muted">O Hub não usa mais no-cors nem compressão local. O upload só segue se o navegador confirmar sucesso real.</p><label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 12 }}><input type="checkbox" checked={createMissingLessons} onChange={(event) => setCreateMissingLessons(event.target.checked)} /> Criar aulas inexistentes</label></div><Stats stats={streamStats} labels={['Pendentes filtrados.', 'Criados no Stream.', 'Ligados às aulas.']} />{streamItems.length ? <div className="progress media-migration-progress"><span style={{ width: `${streamStats.progress}%` }} /></div> : null}<div className="media-migration-toolbar"><input ref={streamFile} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple style={{ display: 'none' }} onChange={(event) => add(event.target.files, 'stream')} /><input ref={streamFolder} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} style={{ display: 'none' }} onChange={(event) => mapFolder(event.target.files)} /><button className="admin-clean-button secondary" type="button" onClick={() => streamFile.current?.click()}>Selecionar vídeos</button><button className="admin-clean-button secondary" type="button" disabled={mapping || streamRunning || !moduleId} onClick={() => streamFolder.current?.click()}>{mapping ? <><Loader2 size={16} className="premium-video-spinner" /> Mapeando...</> : <><FolderUp size={16} /> Selecionar pasta inteligente</>}</button><button className="admin-clean-button primary" type="button" disabled={streamRunning || mapping || !streamItems.length || !moduleId} onClick={() => runStreamQueue(false)}>{streamRunning ? <><Loader2 size={16} className="premium-video-spinner" /> Enviando {streamStats.progress}%</> : <><UploadCloud size={16} /> Enviar apenas pendentes</>}</button><button className="admin-clean-button secondary" type="button" disabled={streamRunning} onClick={() => { setStreamItems([]); setFolderMap(null); }}>Cancelar fila</button></div>{syncMessage ? <p className="muted">{syncMessage}</p> : null}<FolderMapSummary result={folderMap} show={showFolderDetails} onToggle={() => setShowFolderDetails((value) => !value)} />{streamStats.failed ? <button className="admin-clean-button secondary" type="button" disabled={streamRunning} onClick={() => runStreamQueue(true)}>Reenviar falhas do Stream</button> : null}<QueueList items={streamItems} /></section><section className="card admin-section media-migration-card"><div className="section-heading"><div><p className="eyebrow">Sincronização Stream</p><h2>Importar vídeos já enviados</h2><p className="muted">Use quando subir vídeos manualmente no painel Cloudflare Stream.</p></div><span className="admin-clean-pill warning">{selectedModule?.title || 'Selecione um módulo'}</span></div><div className="admin-grid admin-section"><article className="admin-stat"><span>Aulas</span><strong>{totalLessons}</strong><p className="muted">Conteúdos do produto.</p></article><article className="admin-stat"><span>Drive atual</span><strong>{driveLessons}</strong><p className="muted">Aguardam Stream.</p></article><article className="admin-stat"><span>Otimizadas</span><strong>{migratedLessons}</strong><p className="muted">Já usam mídia interna/Stream.</p></article></div><button className="admin-clean-button primary" type="button" disabled={syncing || !moduleId} onClick={syncStream}>{syncing ? <><Loader2 size={16} className="premium-video-spinner" /> Sincronizando...</> : <><RefreshCw size={16} /> Buscar vídeos do Cloudflare</>}</button>{syncResult?.unmatched?.length ? <div className="admin-list media-migration-results">{syncResult.unmatched.slice(0, 80).map((video) => <div className="admin-row" key={video.uid}><div><span className="admin-clean-pill warning">Sem correspondência</span><h3>{video.name}</h3><p className="muted">UID {video.uid} · status {video.status}</p><label>Vincular manualmente<select value={manualLinks[video.uid] || ''} onChange={(event) => setManualLinks((current) => ({ ...current, [video.uid]: event.target.value }))}><option value="">Escolha uma aula</option>{(syncResult.exercises || []).map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.title || exercise.id}</option>)}</select></label></div><button className="admin-clean-button secondary" type="button" disabled={syncing || !manualLinks[video.uid]} onClick={() => linkUnmatched(video.uid)}>Vincular</button></div>)}</div> : null}</section><section className="card admin-section media-migration-card"><div className="section-heading"><div><p className="eyebrow">Cloudflare R2</p><h2>Upload de materiais auxiliares</h2><p className="muted">Áudios, imagens, PDFs e extras continuam no R2.</p></div><span className={`admin-clean-pill ${r2Stats.failed ? 'danger' : r2Stats.done ? 'success' : r2Running ? 'success' : 'warning'}`}>{r2Running ? 'Enviando...' : r2Stats.done ? 'Uploads salvos' : 'Pronto'}</span></div><Stats stats={r2Stats} labels={['Arquivos selecionados.', 'Salvos no R2.', 'Ligados a aulas.']} /><div className="admin-help-box"><strong>Dica importante</strong><p className="muted">Arquivos iniciados por <code>._</code> e <code>.DS_Store</code> são ignorados automaticamente.</p><label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 12 }}><input type="checkbox" checked={auxiliaryVideo} onChange={(event) => setAuxiliaryVideo(event.target.checked)} /> Permitir vídeo apenas como arquivo auxiliar no R2</label></div>{r2Items.length ? <div className="progress media-migration-progress"><span style={{ width: `${r2Stats.progress}%` }} /></div> : null}<div className="media-migration-toolbar"><input ref={r2File} type="file" multiple style={{ display: 'none' }} onChange={(event) => add(event.target.files, 'r2')} /><input ref={r2Folder} type="file" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} style={{ display: 'none' }} onChange={(event) => add(event.target.files, 'r2')} /><button className="admin-clean-button secondary" type="button" onClick={() => r2File.current?.click()}>Importar arquivo</button><button className="admin-clean-button secondary" type="button" onClick={() => r2Folder.current?.click()}><FolderUp size={16} /> Importar pasta</button><button className="admin-clean-button primary" type="button" disabled={r2Running || !r2Items.length || !moduleId} onClick={() => runR2Queue(false)}>{r2Running ? <><Loader2 size={16} className="premium-video-spinner" /> Enviando {r2Stats.progress}%</> : <><UploadCloud size={16} /> Enviar para R2</>}</button><button className="admin-clean-button secondary" type="button" disabled={r2Running} onClick={() => setR2Items([])}>Cancelar fila</button></div>{r2Stats.failed ? <button className="admin-clean-button secondary" type="button" disabled={r2Running} onClick={() => runR2Queue(true)}>Reenviar falhas</button> : null}<QueueList items={r2Items} /></section></>;
}

function Stats({ stats, labels }: { stats: { total: number; done: number; linked: number }; labels: string[] }) { return <div className="admin-grid admin-section"><article className="admin-stat"><span>Na fila</span><strong>{stats.total}</strong><p className="muted">{labels[0]}</p></article><article className="admin-stat"><span>Enviados</span><strong>{stats.done}</strong><p className="muted">{labels[1]}</p></article><article className="admin-stat"><span>Vinculados</span><strong>{stats.linked}</strong><p className="muted">{labels[2]}</p></article></div>; }
function FolderMapSummary({ result, show, onToggle }: { result: FolderMapResult | null; show: boolean; onToggle: () => void }) { if (!result) return null; return <div className="admin-help-box"><strong>Análise da pasta</strong><p className="muted">{result.totalFiles || 0} vídeos analisados · {result.uploadCount || 0} pendentes · {result.skipCount || 0} ignorados.</p><div className="admin-grid admin-section"><article className="admin-stat"><span>Já subiram</span><strong>{result.validStreamCount || 0}</strong><p className="muted">Ignorados.</p></article><article className="admin-stat"><span>Faltantes</span><strong>{result.missingStreamCount || 0}</strong><p className="muted">Na fila.</p></article><article className="admin-stat"><span>Quebrados</span><strong>{result.brokenStreamCount || 0}</strong><p className="muted">Reenviar.</p></article><article className="admin-stat"><span>Novos</span><strong>{result.newLessonCount || 0}</strong><p className="muted">Criar aula.</p></article></div><button className="admin-clean-button secondary" type="button" onClick={onToggle}>{show ? 'Ocultar detalhes' : 'Ver detalhes'}</button>{show ? <div className="admin-list media-migration-results">{(result.mapped || []).slice(0, 160).map((item, index) => { const data = folderBadge(item); return <div className="admin-row" key={`${item.relativePath}-${index}`}><div><span className={`admin-clean-pill ${data.tone}`}>{data.label}</span><h3>{item.fileName}</h3><p className="muted">{item.exerciseTitle || 'Sem aula correspondente'} · {item.reason}{item.streamUid ? ` · UID ${item.streamUid}` : ''}</p></div></div>; })}</div> : null}</div>; }
function QueueList({ items }: { items: Item[] }) { if (!items.length) return null; return <div className="admin-list media-migration-results">{items.slice(0, 160).map((item) => <div className="admin-row" key={item.id}><div><span className={`admin-clean-pill ${item.status === 'linked' || item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}`}>{item.status === 'linked' ? <><Check size={14} /> Vinculado</> : item.status === 'done' ? <><Check size={14} /> Salvo</> : item.status === 'error' ? <><XCircle size={14} /> Falhou</> : item.status === 'uploading' ? 'Enviando' : 'Na fila'}</span><h3>{item.name}</h3><p className="muted">{item.relativePath} · {formatBytes(item.size)} · tentativas {item.attempts}/{RETRY_LIMIT}{item.uid ? ` · UID ${item.uid}` : ''}{item.error ? ` · ${item.error}` : ''}</p></div></div>)}</div>; }
