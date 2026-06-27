'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, Video } from 'lucide-react';

type Props = { productId?: string; productName?: string | null; migrationOnly?: boolean; totalLessons?: number; migratedLessons?: number; driveLessons?: number };
type UploadResult = { key: string; publicUrl: string; uploadUrl: string; expiresIn: number };
type SyncResult = { total: number; linked: number; unmatchedCount: number; errorsCount: number; durationSeconds: number; sizeBytes: number; syncedAt: string; unmatched: Array<{ uid: string; name: string; status: string }>; errors?: Array<{ uid: string; name: string; message: string }> };

function mediaFolder(file: File) { return file.type.startsWith('audio/') ? 'audios/originals' : file.type.startsWith('image/') ? 'images' : 'files'; }
function formatDuration(totalSeconds: number) { const totalMinutes = Math.round(Math.max(0, totalSeconds) / 60); const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}min` : `${minutes}min`; }
function formatBytes(bytes: number) { if (!bytes) return '—'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = bytes; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; } return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`; }
function formatSyncTime(value: string) { if (!value) return '—'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
async function xhrPut(url: string, file: File, onProgress: (n: number) => void) {
  await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('PUT', url); if (file.type) xhr.setRequestHeader('Content-Type', file.type); xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100)); xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou (${xhr.status}).`)); xhr.onerror = () => reject(new Error('Upload interrompido.')); xhr.send(file); });
}

export function AdminMediaUploader({ productId, productName, migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: Props = {}) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

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

  async function uploadR2() {
    if (!file) return;
    setStatus('signing'); setProgress(0); setResult(null); setError('');
    try {
      const response = await fetch('/api/admin/media/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream', folder: mediaFolder(file) }) });
      const signed = await response.json();
      if (!response.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload.');
      setStatus('uploading'); await xhrPut(signed.uploadUrl, file, setProgress); setResult(signed); setProgress(100); setStatus('done');
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro desconhecido ao enviar mídia.'); setStatus('error'); }
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
    <section className="card admin-section"><div className="section-heading"><div><p className="eyebrow">Cloudflare R2</p><h2>Upload de áudios e imagens</h2><p className="muted">Use R2 apenas para áudios, capas, imagens e arquivos auxiliares.</p></div></div><div className="admin-form-grid"><label>Arquivo<input type="file" accept="audio/*,image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>{file ? <div className="admin-preview-card"><span className="pill">{file.type || 'arquivo'}</span><strong>{file.name}</strong><p className="muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div> : null}</div><button className="admin-clean-button primary" type="button" onClick={uploadR2} disabled={!file || status === 'signing' || status === 'uploading'}>{status === 'signing' ? 'Preparando...' : status === 'uploading' ? `Enviando ${progress}%` : 'Enviar para R2'}</button>{status === 'uploading' ? <div className="progress"><span style={{ width: `${progress}%` }} /></div> : null}{status === 'done' && result ? <p className="admin-save-success">Arquivo enviado: {result.publicUrl}</p> : null}{status === 'error' && error ? <p className="admin-save-error">{error}</p> : null}</section>
  </>;
}
