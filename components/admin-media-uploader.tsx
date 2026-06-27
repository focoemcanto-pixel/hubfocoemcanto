'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, FolderUp, Loader2, RefreshCw, UploadCloud, Video, XCircle } from 'lucide-react';

type ModuleOption = { id: string; title: string; slug?: string | null };
type Props = { productId?: string; productName?: string | null; modules?: ModuleOption[]; migrationOnly?: boolean; totalLessons?: number; migratedLessons?: number; driveLessons?: number };
type UploadResult = { key: string; publicUrl: string; uploadUrl: string; expiresIn: number };
type SyncResult = { total: number; linked: number; unmatchedCount: number; errorsCount: number; durationSeconds: number; sizeBytes: number; syncedAt: string; unmatched: Array<{ uid: string; name: string; status: string }>; errors?: Array<{ uid: string; name: string; message: string }> };
type R2Status = 'queued' | 'uploading' | 'done' | 'linked' | 'error';
type MediaType = 'audio' | 'image' | 'file';
type R2Item = { id: string; file: File; name: string; relativePath: string; type: string; size: number; status: R2Status; progress: number; url?: string; error?: string };

function inferMediaType(file: File): MediaType { if (file.type.startsWith('audio/')) return 'audio'; if (file.type.startsWith('image/')) return 'image'; return 'file'; }
function formatDuration(totalSeconds: number) { const totalMinutes = Math.round(Math.max(0, totalSeconds) / 60); const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}min` : `${minutes}min`; }
function formatBytes(bytes: number) { if (!bytes) return '—'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; let value = bytes; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; } return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`; }
function formatSyncTime(value: string) { if (!value) return '—'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function itemId(file: File) { return `${(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}-${file.size}-${file.lastModified}`; }
function isIgnoredFile(file: File) { const path = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name || ''); const name = file.name || ''; return name.startsWith('._') || name === '.DS_Store' || path.includes('/._') || path.includes('/.DS_Store'); }
async function xhrPut(url: string, file: File, onProgress: (n: number) => void) { await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('PUT', url); if (file.type) xhr.setRequestHeader('Content-Type', file.type); xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100)); xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou (${xhr.status}).`)); xhr.onerror = () => reject(new Error('Upload interrompido.')); xhr.send(file); }); }

export function AdminMediaUploader({ productId, productName, modules = [], migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: Props = {}) {
  const firstModule = modules[0]?.id || '';
  const [destinationModuleId, setDestinationModuleId] = useState(firstModule);
  const [auxiliaryVideo, setAuxiliaryVideo] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');
  const [r2Items, setR2Items] = useState<R2Item[]>([]);
  const [r2Running, setR2Running] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const selectedModule = modules.find((module) => module.id === destinationModuleId);

  const r2Stats = useMemo(() => {
    const total = r2Items.length;
    const done = r2Items.filter((item) => item.status === 'done' || item.status === 'linked').length;
    const linked = r2Items.filter((item) => item.status === 'linked').length;
    const failed = r2Items.filter((item) => item.status === 'error').length;
    const overall = total ? Math.round(r2Items.reduce((sum, item) => sum + item.progress, 0) / total) : 0;
    return { total, done, linked, failed, overall };
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

  async function uploadOneR2(item: R2Item) {
    if (!destinationModuleId) { setR2Item(item.id, { status: 'error', error: 'Selecione o módulo de destino.' }); return; }
    const mediaType = inferMediaType(item.file);
    if (item.file.type.startsWith('video/') && !auxiliaryVideo) { setR2Item(item.id, { status: 'error', error: 'Vídeos principais devem ir para o Cloudflare Stream. Marque como arquivo auxiliar para enviar ao R2.' }); return; }
    try {
      setR2Item(item.id, { status: 'uploading', progress: 1, error: '' });
      const response = await fetch('/api/admin/media/signed-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: item.name, contentType: item.file.type || 'application/octet-stream', relativePath: item.relativePath, productId, moduleId: destinationModuleId, mediaType, auxiliaryVideo }),
      });
      const signed: UploadResult & { message?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload.');
      await xhrPut(signed.uploadUrl, item.file, (progress) => setR2Item(item.id, { progress }));
      const completed = await fetch('/api/admin/media/complete-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, moduleId: destinationModuleId, title: item.name, r2Url: signed.publicUrl, mediaType, key: signed.key, relativePath: item.relativePath }),
      });
      const completedJson = await completed.json().catch(() => ({}));
      if (!completed.ok) throw new Error(completedJson?.message || 'Arquivo enviado, mas não foi salvo na biblioteca.');
      setR2Item(item.id, { status: completedJson?.linked ? 'linked' : 'done', progress: 100, url: signed.publicUrl });
    } catch (err) { setR2Item(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Erro desconhecido ao enviar.', progress: 0 }); }
  }

  async function startR2Upload(onlyFailed = false) {
    const queue = r2Items.filter((item) => onlyFailed ? item.status === 'error' : item.status === 'queued' || item.status === 'error');
    if (!queue.length) return;
    setR2Running(true);
    for (const item of queue) await uploadOneR2(item);
    setR2Running(false);
  }

  if (migrationOnly) return <section className="media-migration-compact"><div><span className="admin-clean-eyebrow">Mídia do produto</span><strong>Importação por biblioteca</strong><p className="admin-clean-muted">Vídeos no Stream; áudios, ebooks e capas no R2, sempre ligados a um módulo.</p></div><a className="admin-clean-button primary" href={productId ? `/admin/produtos/${productId}?tab=midia` : '#'}>Abrir Mídia</a></section>;

  return <>
    <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Destino da biblioteca</p><h2>{productName || 'Produto'}</h2><p className="muted">Escolha o módulo antes de importar vídeos do Stream ou enviar materiais auxiliares ao R2.</p></div><span className="admin-clean-pill warning">{selectedModule?.title || 'Selecione um módulo'}</span></div>
      <div className="admin-form-grid"><label>Módulo de destino<select value={destinationModuleId} onChange={(event) => setDestinationModuleId(event.target.value)} required><option value="">Selecione o módulo</option>{modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}</select></label></div>
    </section>

    <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Cloudflare Stream</p><h2>Vídeos das aulas</h2><p className="muted">Envie os vídeos no painel Cloudflare Stream e importe aqui para o módulo escolhido. O Hub vincula pelo nome das aulas.</p></div><span className={`admin-clean-pill ${syncError ? 'danger' : syncResult ? 'success' : 'warning'}`}>{syncing ? 'Importando...' : syncResult ? 'Importado' : 'Pronto'}</span></div>
      <div className="admin-grid admin-section"><article className="admin-stat"><span>Aulas</span><strong>{totalLessons}</strong><p className="muted">Conteúdos do produto.</p></article><article className="admin-stat"><span>Drive atual</span><strong>{driveLessons}</strong><p className="muted">Aguardam Stream.</p></article><article className="admin-stat"><span>Otimizadas</span><strong>{migratedLessons}</strong><p className="muted">Já têm origem interna.</p></article></div>
      <div className="media-migration-toolbar"><button className="admin-clean-button primary" type="button" onClick={syncStream} disabled={syncing || !productId || !destinationModuleId}>{syncing ? <><Loader2 size={16} className="premium-video-spinner" /> Importando...</> : <><RefreshCw size={16} /> Importar do Stream para este módulo</>}</button></div>
      {syncing ? <div className="admin-help-box"><strong><Video size={16} /> Buscando vídeos no Stream</strong><p className="muted">O Hub compara os vídeos do Cloudflare com as aulas do módulo {selectedModule?.title || 'selecionado'}.</p></div> : null}
      {syncError ? <p className="admin-save-error">{syncError}</p> : null}
      {syncResult ? <div className="admin-list media-migration-results"><div className="admin-row"><div><h3>Resultado da importação</h3><div className="stream-sync-summary"><span>{syncResult.total} vídeos encontrados</span><span>{syncResult.linked} vinculados</span><span className={syncResult.unmatchedCount ? 'warning' : ''}>{syncResult.unmatchedCount} sem correspondência</span><span>duração <strong>{formatDuration(syncResult.durationSeconds)}</strong></span><span>espaço <strong>{formatBytes(syncResult.sizeBytes)}</strong></span><span>última importação <strong>{formatSyncTime(syncResult.syncedAt)}</strong></span>{syncResult.errorsCount ? <span className="danger">{syncResult.errorsCount} erros</span> : null}</div></div></div>{syncResult.unmatched?.map((item) => <div className="admin-row" key={item.uid}><div><span className="admin-clean-pill warning">Sem correspondência</span><h3>{item.name}</h3><p className="muted">UID: {item.uid} · {item.status}</p></div></div>)}{syncResult.errors?.map((item) => <div className="admin-row" key={`${item.uid}-error`}><div><span className="admin-clean-pill danger">Erro</span><h3>{item.name}</h3><p className="muted">UID: {item.uid} · {item.message}</p></div></div>)}</div> : null}
    </section>

    <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Cloudflare R2</p><h2>Biblioteca auxiliar</h2><p className="muted">Use para áudios, ebooks, PDFs, capas, imagens e materiais extras do módulo escolhido.</p></div><span className={`admin-clean-pill ${r2Stats.failed ? 'danger' : r2Stats.done ? 'success' : r2Running ? 'success' : 'warning'}`}>{r2Running ? 'Enviando...' : r2Stats.done ? 'Uploads salvos' : 'Pronto'}</span></div>
      <div className="admin-grid admin-section"><article className="admin-stat"><span>Na fila</span><strong>{r2Stats.total}</strong><p className="muted">Arquivos selecionados.</p></article><article className="admin-stat"><span>Enviados</span><strong>{r2Stats.done}</strong><p className="muted">Salvos no R2.</p></article><article className="admin-stat"><span>Vinculados</span><strong>{r2Stats.linked}</strong><p className="muted">Ligados a aulas pelo nome.</p></article></div>
      {r2Items.length ? <div className="progress media-migration-progress"><span style={{ width: `${r2Stats.overall}%` }} /></div> : null}
      <div className="admin-help-box"><strong>R2 é para material auxiliar</strong><p className="muted">Vídeos principais do curso ficam no Stream. Marque a opção abaixo apenas se o vídeo for um arquivo auxiliar.</p><label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 12 }}><input type="checkbox" checked={auxiliaryVideo} onChange={(event) => setAuxiliaryVideo(event.target.checked)} /> Permitir vídeo como arquivo auxiliar no R2</label></div>
      <div className="media-migration-toolbar"><input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(event) => addR2Files(event.target.files)} /><input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} style={{ display: 'none' }} onChange={(event) => addR2Files(event.target.files)} /><button className="admin-clean-button secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={r2Running}>Selecionar arquivos</button><button className="admin-clean-button secondary" type="button" onClick={() => folderInputRef.current?.click()} disabled={r2Running}><FolderUp size={16} /> Selecionar pasta</button><button className="admin-clean-button primary" type="button" onClick={() => startR2Upload(false)} disabled={r2Running || !destinationModuleId || !r2Items.some((item) => item.status === 'queued' || item.status === 'error')}>{r2Running ? <><Loader2 size={16} className="premium-video-spinner" /> Enviando {r2Stats.overall}%</> : <><UploadCloud size={16} /> Enviar para R2</>}</button><button className="admin-clean-button secondary" type="button" onClick={() => setR2Items([])} disabled={r2Running}>Limpar fila</button></div>
      <div className="admin-help-box"><strong>Dica importante</strong><p className="muted">Arquivos iniciados por <code>._</code> e <code>.DS_Store</code> são ignorados automaticamente.</p></div>
      {r2Stats.failed ? <button className="admin-clean-button secondary" type="button" onClick={() => startR2Upload(true)} disabled={r2Running}>Reenviar falhas</button> : null}
      {r2Items.length ? <div className="admin-list media-migration-results">{r2Items.slice(0, 120).map((item) => <div className="admin-row" key={item.id}><div><span className={`admin-clean-pill ${item.status === 'linked' || item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}`}>{item.status === 'linked' ? <><Check size={14} /> Vinculado</> : item.status === 'done' ? <><Check size={14} /> Salvo</> : item.status === 'error' ? <><XCircle size={14} /> Falhou</> : item.status === 'uploading' ? 'Enviando' : 'Na fila'}</span><h3>{item.name}</h3><p className="muted">{item.relativePath} · {formatBytes(item.size)}{item.url ? ` · ${item.url}` : ''}{item.error ? ` · ${item.error}` : ''}</p></div><strong>{item.progress}%</strong></div>)}</div> : null}
    </section>
  </>;
}
