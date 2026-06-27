'use client';

import { useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Video } from 'lucide-react';

type ModuleOption = { id: string; title: string; slug?: string | null };
type Props = { productId?: string; productName?: string | null; modules?: ModuleOption[]; migrationOnly?: boolean; totalLessons?: number; migratedLessons?: number; driveLessons?: number };
type QueueStatus = 'Na fila' | 'Enviando' | 'Salvo' | 'Vinculado' | 'Falhou';
type QueueItem = { id: string; file: File; relativePath: string; mediaType: 'audio' | 'image' | 'file'; progress: number; status: QueueStatus; message?: string; publicUrl?: string };
type SyncResult = { total: number; linked: number; unmatchedCount: number; errorsCount: number; durationSeconds: number; sizeBytes: number; syncedAt: string; unmatched: Array<{ uid: string; name: string; status: string }>; errors?: Array<{ uid: string; name: string; message: string }> };

function inferMediaType(file: File): 'audio' | 'image' | 'file' { return file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : 'file'; }
function displayRelativePath(file: File) { return String((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name); }
function uploadRelativeFolder(path: string) { const parts = path.split('/').filter(Boolean); return parts.length > 1 ? parts.slice(1, -1).join('/') : ''; }
function isIgnoredMacFile(path: string) { const name = path.split('/').pop() || path; return name === '.DS_Store' || name.startsWith('._'); }
function formatDuration(totalSeconds: number) { const totalMinutes = Math.round(Math.max(0, totalSeconds) / 60); const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}min` : `${minutes}min`; }
function formatBytes(bytes: number) { if (!bytes) return '—'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = bytes; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; } return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`; }
function formatSyncTime(value: string) { if (!value) return '—'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
async function xhrPut(url: string, file: File, onProgress: (n: number) => void) {
  await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('PUT', url); if (file.type) xhr.setRequestHeader('Content-Type', file.type); xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100)); xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou (${xhr.status}).`)); xhr.onerror = () => reject(new Error('Upload interrompido.')); xhr.send(file); });
}

export function AdminMediaUploader({ productId, productName, modules = [], migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: Props = {}) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploadingR2, setUploadingR2] = useState(false);
  const [error, setError] = useState('');
  const [allowAuxiliaryVideos, setAllowAuxiliaryVideos] = useState(false);
  const totalProgress = useMemo(() => queue.length ? Math.round(queue.reduce((sum, item) => sum + item.progress, 0) / queue.length) : 0, [queue]);
  const failedCount = queue.filter((item) => item.status === 'Falhou').length;

  async function syncStream() {
    if (!productId) return;
    setSyncing(true); setSyncError(''); setSyncResult(null);
    try {
      const response = await fetch('/api/admin/media/stream-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.message || 'Não foi possível sincronizar o Stream.');
      setSyncResult(json);
    } catch (err) { setSyncError(err instanceof Error ? err.message : 'Erro desconhecido ao sincronizar.'); }
    setSyncing(false);
  }

  function addFiles(files?: FileList | null) {
    const items = Array.from(files || []).filter((file) => !isIgnoredMacFile(displayRelativePath(file))).map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`, file, relativePath: displayRelativePath(file), mediaType: inferMediaType(file), auxiliaryVideo: false, progress: 0, status: 'Na fila' as QueueStatus }));
    setQueue((current) => [...current, ...items]);
  }

  function patchItem(id: string, patch: Partial<QueueItem>) { setQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }

  async function uploadOne(item: QueueItem) {
    if (item.file.type === 'video/mp4' && !allowAuxiliaryVideos) throw new Error('Vídeos principais devem ir para o Cloudflare Stream. Use R2 apenas para áudios, capas e arquivos auxiliares.');
    const response = await fetch('/api/admin/media/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, moduleId: selectedModuleId, relativePath: uploadRelativeFolder(item.relativePath), mediaType: item.mediaType, fileName: item.file.name, contentType: item.file.type || 'application/octet-stream', auxiliaryVideo: allowAuxiliaryVideos }) });
    const signed = await response.json();
    if (!response.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload.');
    await xhrPut(signed.uploadUrl, item.file, (progress) => patchItem(item.id, { progress }));
    const completed = await fetch('/api/admin/media/complete-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, moduleId: selectedModuleId, title: item.file.name, r2Url: signed.publicUrl, mediaType: item.mediaType, key: signed.key, relativePath: item.relativePath }) });
    const saved = await completed.json().catch(() => ({}));
    if (!completed.ok) throw new Error(saved?.message || saved?.error || 'Upload feito, mas não foi possível salvar o registro.');
    patchItem(item.id, { progress: 100, publicUrl: signed.publicUrl, status: saved?.linked ? 'Vinculado' : 'Salvo', message: saved?.linked ? 'Vinculado automaticamente à aula/exercício.' : 'Registro salvo em media_assets.' });
  }

  async function uploadR2(onlyFailures = false) {
    if (!productId || !selectedModuleId) { setError('Selecione o módulo de destino antes de enviar.'); return; }
    const targets = queue.filter((item) => onlyFailures ? item.status === 'Falhou' : ['Na fila', 'Falhou'].includes(item.status));
    if (!targets.length) return;
    setUploadingR2(true); setError('');
    for (const item of targets) {
      patchItem(item.id, { status: 'Enviando', progress: 0, message: '' });
      try { await uploadOne(item); } catch (err) { patchItem(item.id, { status: 'Falhou', message: err instanceof Error ? err.message : 'Erro desconhecido ao enviar mídia.' }); }
    }
    setUploadingR2(false);
  }

  if (migrationOnly) return <section className="media-migration-compact"><div><span className="admin-clean-eyebrow">Mídia do produto</span><strong>Vídeos via Cloudflare Stream</strong><p className="admin-clean-muted">Envie vídeos manualmente no painel Cloudflare e sincronize pelo Hub.</p></div><a className="admin-clean-button primary" href={productId ? `/admin/produtos/${productId}?tab=midia` : '#'}>Abrir Mídia</a></section>;

  return <>
    <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Cloudflare Stream</p><h2>{productName ? `Biblioteca Stream · ${productName}` : 'Biblioteca Stream'}</h2><p className="muted">Suba os vídeos no painel Cloudflare Stream. Depois clique para o Hub encontrar pelo nome e vincular às aulas.</p></div><span className={`admin-clean-pill ${syncError ? 'danger' : syncResult ? 'success' : 'warning'}`}>{syncing ? 'Sincronizando...' : syncResult ? 'Sincronizado' : 'Pronto'}</span></div>
      <div className="admin-grid admin-section"><article className="admin-stat"><span>Aulas</span><strong>{totalLessons}</strong><p className="muted">Conteúdos do produto.</p></article><article className="admin-stat"><span>Drive atual</span><strong>{driveLessons}</strong><p className="muted">Aguardam Stream.</p></article><article className="admin-stat"><span>Otimizadas</span><strong>{migratedLessons}</strong><p className="muted">Já têm media_url.</p></article></div>
      <div className="media-migration-toolbar"><button className="admin-clean-button primary" type="button" onClick={syncStream} disabled={syncing || !productId}>{syncing ? <><Loader2 size={16} className="premium-video-spinner" /> Sincronizando...</> : <><RefreshCw size={16} /> Sincronizar vídeos do Stream</>}</button></div>
      {syncing ? <div className="admin-help-box"><strong><Video size={16} /> Buscando vídeos no Stream</strong><p className="muted">Comparando nomes normalizados com títulos e slugs das aulas. Nenhum upload pelo navegador será feito.</p></div> : null}
      {syncError ? <p className="admin-save-error">{syncError}</p> : null}
      {syncResult ? <div className="admin-list media-migration-results"><div className="admin-row"><div><h3>Resultado da sincronização</h3><div className="stream-sync-summary"><span>✓ {totalLessons || syncResult.linked} aulas</span><span>✓ {syncResult.total} vídeos encontrados</span><span>✓ {syncResult.linked} vinculados</span><span className={syncResult.unmatchedCount ? 'warning' : ''}>{syncResult.unmatchedCount ? '⚠' : '✓'} {syncResult.unmatchedCount} sem correspondência</span><span>✓ duração total <strong>{formatDuration(syncResult.durationSeconds)}</strong></span><span>✓ espaço utilizado <strong>{formatBytes(syncResult.sizeBytes)}</strong></span><span>✓ última sincronização <strong>{formatSyncTime(syncResult.syncedAt)}</strong></span>{syncResult.errorsCount ? <span className="danger">⚠ {syncResult.errorsCount} erros</span> : null}</div></div></div>{syncResult.unmatched?.map((item) => <div className="admin-row" key={item.uid}><div><span className="admin-clean-pill warning">Sem correspondência</span><h3>{item.name}</h3><p className="muted">UID: {item.uid} · {item.status}</p></div></div>)}{syncResult.errors?.map((item) => <div className="admin-row" key={`${item.uid}-error`}><div><span className="admin-clean-pill danger">Erro</span><h3>{item.name}</h3><p className="muted">UID: {item.uid} · {item.message}</p></div></div>)}</div> : null}
    </section>
    <section className="card admin-section"><div className="section-heading"><div><p className="eyebrow">Cloudflare R2</p><h2>Upload de áudios e imagens</h2><p className="muted">Selecione o módulo e envie áudios, capas, imagens e arquivos auxiliares para a pasta correta do produto.</p></div><span className="admin-clean-pill warning">R2 não substitui Stream</span></div><div className="admin-form-grid"><label>Módulo de destino<select value={selectedModuleId} onChange={(e) => setSelectedModuleId(e.target.value)} required><option value="">Selecione um módulo</option>{modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}</select></label><label className="admin-checkbox-row"><input type="checkbox" checked={allowAuxiliaryVideos} onChange={(e) => setAllowAuxiliaryVideos(e.target.checked)} /> Marcar vídeos como arquivo auxiliar</label></div><div className="media-migration-toolbar"><input ref={fileInputRef} type="file" multiple accept="audio/*,image/*,application/pdf,text/*,.zip,.mid,.midi" onChange={(e) => addFiles(e.target.files)} hidden /><input ref={folderInputRef} type="file" multiple onChange={(e) => addFiles(e.target.files)} hidden {...({ webkitdirectory: '', directory: '' } as any)} /><button className="admin-clean-button secondary" type="button" onClick={() => fileInputRef.current?.click()}>Selecionar arquivos</button><button className="admin-clean-button secondary" type="button" onClick={() => folderInputRef.current?.click()}>Selecionar pasta</button><button className="admin-clean-button primary" type="button" onClick={() => uploadR2(false)} disabled={!selectedModuleId || !queue.length || uploadingR2}>{uploadingR2 ? `Enviando ${totalProgress}%` : 'Enviar para R2'}</button>{failedCount ? <button className="admin-clean-button danger" type="button" onClick={() => uploadR2(true)} disabled={uploadingR2}>Reenviar falhas</button> : null}</div>{queue.some((item) => item.file.type === 'video/mp4') ? <p className="admin-save-error">Vídeos principais devem ir para o Cloudflare Stream. Use R2 apenas para áudios, capas e arquivos auxiliares.</p> : null}{queue.length ? <div className="progress"><span style={{ width: `${totalProgress}%` }} /></div> : null}<div className="admin-list media-migration-results">{queue.map((item) => <div className="admin-row" key={item.id}><div><span className={`admin-clean-pill ${item.status === 'Falhou' ? 'danger' : item.status === 'Vinculado' || item.status === 'Salvo' ? 'success' : 'warning'}`}>{item.status}</span><h3>{item.relativePath}</h3><p className="muted">{item.mediaType} · {(item.file.size / 1024 / 1024).toFixed(2)} MB {item.message ? `· ${item.message}` : ''}</p>{item.publicUrl ? <p className="muted">{item.publicUrl}</p> : null}</div><strong>{item.progress}%</strong></div>)}</div>{error ? <p className="admin-save-error">{error}</p> : null}</section>
  </>;
}
