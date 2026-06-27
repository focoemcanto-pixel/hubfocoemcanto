'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, FolderUp, Loader2, RefreshCw, UploadCloud, Video, XCircle } from 'lucide-react';

type ModuleOption = { id: string; title: string; slug?: string | null };
type Props = { productId?: string; productName?: string | null; modules?: ModuleOption[]; migrationOnly?: boolean; totalLessons?: number; migratedLessons?: number; driveLessons?: number };
type UploadResult = { key: string; publicUrl: string; uploadUrl: string; expiresIn: number };
type SyncResult = { total: number; linked: number; unmatchedCount: number; errorsCount: number; durationSeconds: number; sizeBytes: number; syncedAt: string; unmatched: Array<{ uid: string; name: string; status: string }>; errors?: Array<{ uid: string; name: string; message: string }> };
type R2Status = 'queued' | 'uploading' | 'done' | 'error';
type R2Item = { id: string; file: File; name: string; relativePath: string; type: string; size: number; status: R2Status; progress: number; url?: string; error?: string };

function mediaFolder(file: File) { if (file.type.startsWith('audio/')) return 'audios/originals'; if (file.type.startsWith('image/')) return 'images'; if (file.type.startsWith('video/')) return 'videos/auxiliares'; return 'files'; }
function formatDuration(totalSeconds: number) { const totalMinutes = Math.round(Math.max(0, totalSeconds) / 60); const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}min` : `${minutes}min`; }
function formatBytes(bytes: number) { if (!bytes) return '—'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = bytes; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; } return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`; }
function formatSyncTime(value: string) { if (!value) return '—'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function itemId(file: File) { return `${(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}-${file.size}-${file.lastModified}`; }
function isIgnoredFile(file: File) { const name = file.name || ''; return name.startsWith('._') || name === '.DS_Store' || name.includes('/._') || name.includes('/.DS_Store'); }
async function xhrPut(url: string, file: File, onProgress: (n: number) => void) { await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('PUT', url); if (file.type) xhr.setRequestHeader('Content-Type', file.type); xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100)); xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou (${xhr.status}).`)); xhr.onerror = () => reject(new Error('Upload interrompido.')); xhr.send(file); }); }

export function AdminMediaUploader({ productId, productName, migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: Props = {}) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');
  const [r2Items, setR2Items] = useState<R2Item[]>([]);
  const [r2Running, setR2Running] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const r2Stats = useMemo(() => {
    const total = r2Items.length;
    const done = r2Items.filter((item) => item.status === 'done').length;
    const failed = r2Items.filter((item) => item.status === 'error').length;
    const overall = total ? Math.round(r2Items.reduce((sum, item) => sum + item.progress, 0) / total) : 0;
    return { total, done, failed, overall };
  }, [r2Items]);

  function setR2Item(id: string, patch: Partial<R2Item>) { setR2Items((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function addR2Files(files: FileList | null) {
    const nextFiles = Array.from(files || []).filter((file) => !isIgnoredFile(file));
    if (!nextFiles.length) return;
    setR2Items((current) => {
      const map = new Map(current.map((item) => [item.id, item]));
      nextFiles.forEach((file) => {
        const id = itemId(file);
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        map.set(id, { id, file, name: file.name, relativePath, type: file.type || 'arquivo', size: file.size, status: 'queued', progress: 0 });
      });
      return Array.from(map.values());
    });
  }

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

  async function uploadOneR2(item: R2Item) {
    try {
      setR2Item(item.id, { status: 'uploading', progress: 1, error: '' });
      const response = await fetch('/api/admin/media/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: item.name, contentType: item.file.type || 'application/octet-stream', folder: mediaFolder(item.file), relativePath: item.relativePath, productId }) });
      const signed: UploadResult & { message?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload.');
      await xhrPut(signed.uploadUrl, item.file, (progress) => setR2Item(item.id, { progress }));
      setR2Item(item.id, { status: 'done', progress: 100, url: signed.publicUrl });
    } catch (err) { setR2Item(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Erro desconhecido ao enviar.', progress: 0 }); }
  }

  async function startR2Upload(onlyFailed = false) {
    const queue = r2Items.filter((item) => onlyFailed ? item.status === 'error' : item.status === 'queued' || item.status === 'error');
    if (!queue.length) return;
    setR2Running(true);
    for (const item of queue) await uploadOneR2(item);
    setR2Running(false);
  }

  if (migrationOnly) return <section className="media-migration-compact"><div><span className="admin-clean-eyebrow">Mídia do produto</span><strong>Vídeos via Cloudflare Stream</strong><p className="admin-clean-muted">Envie vídeos no painel Cloudflare e sincronize pelo Hub.</p></div><a className="admin-clean-button primary" href={productId ? `/admin/produtos/${productId}?tab=midia` : '#'}>Abrir Mídia</a></section>;

  return <>
    <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Cloudflare Stream</p><h2>{productName ? `Biblioteca Stream · ${productName}` : 'Biblioteca Stream'}</h2><p className="muted">Suba os vídeos no painel Cloudflare Stream. Depois o Hub encontra pelo nome e vincula às aulas.</p></div><span className={`admin-clean-pill ${syncError ? 'danger' : syncResult ? 'success' : 'warning'}`}>{syncing ? 'Sincronizando...' : syncResult ? 'Sincronizado' : 'Pronto'}</span></div>
      <div className="admin-grid admin-section"><article className="admin-stat"><span>Aulas</span><strong>{totalLessons}</strong><p className="muted">Conteúdos do produto.</p></article><article className="admin-stat"><span>Drive atual</span><strong>{driveLessons}</strong><p className="muted">Aguardam Stream.</p></article><article className="admin-stat"><span>Otimizadas</span><strong>{migratedLessons}</strong><p className="muted">Já têm origem interna.</p></article></div>
      <div className="media-migration-toolbar"><button className="admin-clean-button primary" type="button" onClick={syncStream} disabled={syncing || !productId}>{syncing ? <><Loader2 size={16} className="premium-video-spinner" /> Sincronizando...</> : <><RefreshCw size={16} /> Sincronizar vídeos do Stream</>}</button></div>
      {syncing ? <div className="admin-help-box"><strong><Video size={16} /> Buscando vídeos no Stream</strong><p className="muted">Comparando nomes normalizados com títulos e slugs das aulas. Nenhum upload pelo navegador será feito.</p></div> : null}
      {syncError ? <p className="admin-save-error">{syncError}</p> : null}
      {syncResult ? <div className="admin-list media-migration-results"><div className="admin-row"><div><h3>Resultado da sincronização</h3><div className="stream-sync-summary"><span>✓ {syncResult.total} vídeos encontrados</span><span>✓ {syncResult.linked} vinculados</span><span className={syncResult.unmatchedCount ? 'warning' : ''}>{syncResult.unmatchedCount ? '⚠' : '✓'} {syncResult.unmatchedCount} sem correspondência</span><span>✓ duração <strong>{formatDuration(syncResult.durationSeconds)}</strong></span><span>✓ espaço <strong>{formatBytes(syncResult.sizeBytes)}</strong></span><span>✓ última sincronização <strong>{formatSyncTime(syncResult.syncedAt)}</strong></span>{syncResult.errorsCount ? <span className="danger">⚠ {syncResult.errorsCount} erros</span> : null}</div></div></div>{syncResult.unmatched?.map((item) => <div className="admin-row" key={item.uid}><div><span className="admin-clean-pill warning">Sem correspondência</span><h3>{item.name}</h3><p className="muted">UID: {item.uid} · {item.status}</p></div></div>)}{syncResult.errors?.map((item) => <div className="admin-row" key={`${item.uid}-error`}><div><span className="admin-clean-pill danger">Erro</span><h3>{item.name}</h3><p className="muted">UID: {item.uid} · {item.message}</p></div></div>)}</div> : null}
    </section>
    <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Cloudflare R2</p><h2>Upload de áudios, imagens e arquivos</h2><p className="muted">Selecione arquivos ou uma pasta. Use R2 para áudios de treino, capas, PDFs e materiais auxiliares.</p></div><span className={`admin-clean-pill ${r2Stats.failed ? 'danger' : r2Stats.done ? 'success' : r2Running ? 'success' : 'warning'}`}>{r2Running ? 'Enviando...' : r2Stats.done ? 'Uploads salvos' : 'Pronto'}</span></div>
      <div className="admin-grid admin-section"><article className="admin-stat"><span>Na fila</span><strong>{r2Stats.total}</strong><p className="muted">Arquivos selecionados.</p></article><article className="admin-stat"><span>Enviados</span><strong>{r2Stats.done}</strong><p className="muted">Salvos no R2.</p></article><article className="admin-stat"><span>Falhas</span><strong>{r2Stats.failed}</strong><p className="muted">Podem ser reenviadas.</p></article></div>
      {r2Items.length ? <div className="progress media-migration-progress"><span style={{ width: `${r2Stats.overall}%` }} /></div> : null}
      <div className="media-migration-toolbar"><input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(event) => addR2Files(event.target.files)} /><input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} style={{ display: 'none' }} onChange={(event) => addR2Files(event.target.files)} /><button className="admin-clean-button secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={r2Running}>Selecionar arquivos</button><button className="admin-clean-button secondary" type="button" onClick={() => folderInputRef.current?.click()} disabled={r2Running}><FolderUp size={16} /> Selecionar pasta</button><button className="admin-clean-button primary" type="button" onClick={() => startR2Upload(false)} disabled={r2Running || !r2Items.some((item) => item.status === 'queued' || item.status === 'error')}>{r2Running ? <><Loader2 size={16} className="premium-video-spinner" /> Enviando {r2Stats.overall}%</> : <><UploadCloud size={16} /> Enviar para R2</>}</button><button className="admin-clean-button secondary" type="button" onClick={() => setR2Items([])} disabled={r2Running}>Limpar fila</button></div>
      <div className="admin-help-box"><strong>Dica importante</strong><p className="muted">Arquivos iniciados por <code>._</code> e <code>.DS_Store</code> são ignorados automaticamente. Vídeos principais devem ficar no Cloudflare Stream.</p></div>
      {r2Stats.failed ? <button className="admin-clean-button secondary" type="button" onClick={() => startR2Upload(true)} disabled={r2Running}>Reenviar falhas</button> : null}
      {r2Items.length ? <div className="admin-list media-migration-results">{r2Items.slice(0, 120).map((item) => <div className="admin-row" key={item.id}><div><span className={`admin-clean-pill ${item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}`}>{item.status === 'done' ? <><Check size={14} /> Salvo</> : item.status === 'error' ? <><XCircle size={14} /> Falhou</> : item.status === 'uploading' ? 'Enviando' : 'Na fila'}</span><h3>{item.name}</h3><p className="muted">{item.relativePath} · {formatBytes(item.size)}{item.url ? ` · ${item.url}` : ''}{item.error ? ` · ${item.error}` : ''}</p></div><strong>{item.progress}%</strong></div>)}</div> : null}
    </section>
  </>;
}
