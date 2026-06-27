'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ItemStatus = 'queued' | 'creating' | 'uploading' | 'saving' | 'done' | 'error';
type UploadResult = { key: string; publicUrl: string; uploadUrl: string; expiresIn: number };
type Item = { id: string; file?: File; name: string; relativePath: string; progress: number; status: ItemStatus; uid?: string; attempts?: number; matched?: boolean; exerciseTitle?: string | null; error?: string; needsFile?: boolean; size?: number; type?: string };
type Props = { productId?: string; productName?: string | null; migrationOnly?: boolean; totalLessons?: number; migratedLessons?: number; driveLessons?: number };

const RETRY_LIMIT = 5;
const RETRY_DELAYS = [2500, 7000, 15000, 30000, 45000];
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function fileKey(file: File) { return `${(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}-${file.size}-${file.lastModified}`; }
function isVideo(file: File) { return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name); }
function mediaFolder(file: File) { return file.type.startsWith('audio/') ? 'audios/originals' : file.type.startsWith('image/') ? 'images' : 'files'; }

async function xhrSend(method: 'POST' | 'PUT', url: string, body: BodyInit, onProgress: (n: number) => void, contentType?: string) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou (${xhr.status}). ${xhr.responseText || ''}`));
    xhr.onerror = () => reject(new Error('Upload interrompido. Verifique sua conexão.'));
    xhr.send(body);
  });
}

async function streamFormUpload(url: string, file: File, onProgress: (n: number) => void) {
  const form = new FormData();
  form.append('file', file, file.name);
  await xhrSend('POST', url, form, onProgress);
}

export function AdminMediaUploader({ productId, productName, migrationOnly = false }: Props = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [restored, setRestored] = useState(0);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  const stats = useMemo(() => ({
    total: items.length,
    done: items.filter((i) => i.status === 'done').length,
    errors: items.filter((i) => i.status === 'error').length,
    matched: items.filter((i) => i.matched).length,
    needsFile: items.filter((i) => i.needsFile).length,
    overall: items.length ? Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length) : 0,
  }), [items]);

  useEffect(() => { if (productId && !migrationOnly) void loadQueue(); }, [productId, migrationOnly]);

  function updateItem(id: string, patch: Partial<Item>) { setItems((current) => current.map((i) => i.id === id ? { ...i, ...patch } : i)); }

  async function saveItem(item: Item) {
    if (!productId) return;
    await fetch('/api/admin/media/stream-queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, fileKey: item.id, fileName: item.name, relativePath: item.relativePath, fileSize: item.size || item.file?.size || null, fileType: item.type || item.file?.type || null, status: item.status, progress: item.progress, streamUid: item.uid || '', attempts: item.attempts || 0, lastError: item.error || '', matchedExerciseTitle: item.exerciseTitle || null, raw: { uploadMode: 'direct_form' } }),
    }).catch(() => null);
  }

  async function patchItem(item: Item, patch: Partial<Item>) {
    updateItem(item.id, patch);
    if (!productId) return;
    await fetch('/api/admin/media/stream-queue', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, fileKey: item.id, status: patch.status, progress: patch.progress, streamUid: patch.uid, attempts: patch.attempts, lastError: patch.error, matchedExerciseTitle: patch.exerciseTitle }),
    }).catch(() => null);
  }

  async function loadQueue() {
    const response = await fetch(`/api/admin/media/stream-queue?productId=${encodeURIComponent(productId || '')}`, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const json = await response.json().catch(() => ({}));
    const rows = Array.isArray(json.items) ? json.items : [];
    const loaded = rows.map((row: any) => ({ id: String(row.file_key), name: String(row.file_name || 'Vídeo'), relativePath: String(row.relative_path || row.file_name || 'Vídeo'), progress: Number(row.progress || 0), status: 'error' as ItemStatus, uid: row.stream_uid || undefined, attempts: Number(row.attempts || 0), exerciseTitle: row.matched_exercise_title || null, error: row.last_error || 'Selecione a mesma pasta novamente para continuar.', needsFile: true }));
    if (loaded.length) { setItems((current) => [...current, ...loaded.filter((item: Item) => !current.some((old) => old.id === item.id))]); setRestored(loaded.length); }
  }

  function addFiles(files: FileList | null) {
    const videos = Array.from(files || []).filter((f) => isVideo(f) && !f.name.startsWith('._'));
    if (!videos.length) return;
    setItems((current) => {
      const map = new Map(current.map((item) => [item.id, item]));
      videos.forEach((file) => {
        const id = fileKey(file);
        const old = map.get(id);
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const next: Item = { ...(old || {}), id, file, name: file.name, relativePath, size: file.size, type: file.type, status: old?.status === 'done' ? 'done' : 'queued', progress: old?.status === 'done' ? 100 : 0, needsFile: false, error: '' };
        map.set(id, next); void saveItem(next);
      });
      return Array.from(map.values());
    });
  }

  async function createUpload(item: Item) {
    const response = await fetch('/api/admin/media/stream-upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: item.name, relativePath: item.relativePath, productId }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.message || json?.error || 'Não foi possível criar upload no Stream.');
    return json as { uid: string; uploadURL: string };
  }

  async function completeUpload(item: Item, uid: string) {
    const response = await fetch('/api/admin/media/stream-upload-complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, fileName: item.name, relativePath: item.relativePath, productId }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.message || json?.error || 'Upload enviado, mas não consegui salvar no Hub.');
    return json as { matched?: boolean; exerciseTitle?: string | null };
  }

  async function uploadItem(item: Item) {
    if (!item.file) { await patchItem(item, { status: 'error', error: 'Selecione este arquivo novamente para continuar.', needsFile: true }); return; }
    let attempt = item.attempts || 0;
    while (attempt < RETRY_LIMIT) {
      try {
        attempt += 1;
        await patchItem(item, { status: 'creating', error: '', attempts: attempt });
        const created = await createUpload(item);
        await patchItem(item, { status: 'uploading', uid: created.uid, progress: 1, attempts: attempt });
        await streamFormUpload(created.uploadURL, item.file, (p) => updateItem(item.id, { progress: p }));
        await patchItem(item, { status: 'saving', progress: 100, attempts: attempt });
        const done = await completeUpload(item, created.uid);
        await patchItem(item, { status: 'done', matched: done.matched, exerciseTitle: done.exerciseTitle || null, uid: created.uid, progress: 100, error: '', attempts: attempt });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        await patchItem(item, { status: 'error', error: `${message} · tentativa ${attempt}/${RETRY_LIMIT}`, attempts: attempt });
        if (attempt >= RETRY_LIMIT) return;
        await sleep(RETRY_DELAYS[attempt - 1] || 45000);
      }
    }
  }

  async function startStreamUpload() {
    const queue = items.filter((item) => (item.status === 'queued' || item.status === 'error') && !item.needsFile && item.status !== 'done');
    if (!queue.length) return;
    setRunning(true);
    for (const item of queue) await uploadItem(item);
    setRunning(false);
  }

  async function uploadR2() {
    if (!file) return;
    setStatus('signing'); setProgress(0); setResult(null); setError('');
    try {
      const response = await fetch('/api/admin/media/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream', folder: mediaFolder(file) }) });
      const signed = await response.json();
      if (!response.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload.');
      setStatus('uploading'); await xhrSend('PUT', signed.uploadUrl, file, setProgress, file.type || undefined);
      setResult(signed); setProgress(100); setStatus('done');
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro desconhecido ao enviar mídia.'); setStatus('error'); }
  }

  if (migrationOnly) return <section className="media-migration-compact"><div><span className="admin-clean-eyebrow">Mídia do produto</span><strong>Vídeos agora serão enviados pelo Cloudflare Stream</strong><p className="admin-clean-muted">Use a aba Mídia para enviar vídeos ao Stream e áudios/imagens ao R2.</p></div><a className="admin-clean-button primary" href={productId ? `/admin/produtos/${productId}?tab=midia` : '#'}>Abrir Mídia</a></section>;

  return <>
    <section className="card admin-section media-migration-card">
      <div className="section-heading"><div><p className="eyebrow">Cloudflare Stream</p><h2>{productName ? `Upload seguro · ${productName}` : 'Upload seguro'}</h2><p className="muted">Envio por formulário direto, 1 vídeo por vez, com fila salva e retentativas automáticas.</p></div><span className="admin-clean-pill success">{running ? 'Enviando...' : 'Pronto'}</span></div>
      <div className="admin-grid admin-section"><article className="admin-stat"><span>Na fila</span><strong>{stats.total}</strong><p className="muted">Vídeos selecionados.</p></article><article className="admin-stat"><span>Enviados</span><strong>{stats.done}</strong><p className="muted">UID salvo.</p></article><article className="admin-stat"><span>Vinculados</span><strong>{stats.matched}</strong><p className="muted">Aulas encontradas.</p></article></div>
      {items.length ? <div className="progress media-migration-progress"><span style={{ width: `${stats.overall}%` }} /></div> : null}
      <div className="media-migration-toolbar"><input ref={pickerRef} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple style={{ display: 'none' }} onChange={(e) => addFiles(e.target.files)} /><input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} style={{ display: 'none' }} id="stream-folder-input" onChange={(e) => addFiles(e.target.files)} /><button className="admin-clean-button secondary" type="button" onClick={() => pickerRef.current?.click()}>Selecionar vídeos</button><label className="admin-clean-button secondary" htmlFor="stream-folder-input">Selecionar pasta</label><button className="admin-clean-button primary" type="button" onClick={startStreamUpload} disabled={running || !items.length || items.every((i) => i.status === 'done' || i.needsFile)}>{running ? `Enviando ${stats.overall}%` : 'Iniciar / continuar'}</button><button className="admin-clean-button secondary" type="button" onClick={() => setItems([])} disabled={running}>Limpar tela</button></div>
      <div className="admin-help-box"><strong>Modo compatível ativado</strong><p className="muted">O direct_upload do Cloudflare usa formulário. Esta versão remove TUS e elimina o Decoding Error.</p>{restored ? <p className="admin-save-success">{restored} upload(s) pendente(s) encontrados.</p> : null}{stats.needsFile ? <p className="admin-save-error">{stats.needsFile} item(ns) precisam reanexar os arquivos locais.</p> : null}</div>
      {stats.errors ? <p className="admin-save-error">{stats.errors} vídeo(s) falharam. Clique em continuar para tentar novamente.</p> : null}
      {items.length ? <div className="admin-list media-migration-results">{items.slice(0, 120).map((item) => <div className="admin-row" key={item.id}><div><span className={`admin-clean-pill ${item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}`}>{item.status === 'done' ? 'Enviado' : item.needsFile ? 'Reanexar' : item.status === 'error' ? 'Falhou' : item.status === 'queued' ? 'Na fila' : item.status === 'saving' ? 'Salvando' : 'Enviando'}</span><h3>{item.name}</h3><p className="muted">{item.exerciseTitle ? `Vinculado: ${item.exerciseTitle}` : item.uid ? `UID: ${item.uid}` : item.relativePath}{item.attempts ? ` · tentativas: ${item.attempts}` : ''}{item.error ? ` · ${item.error}` : ''}</p></div><strong>{item.progress}%</strong></div>)}</div> : null}
    </section>
    <section className="card admin-section"><div className="section-heading"><div><p className="eyebrow">Cloudflare R2</p><h2>Upload de áudios e imagens</h2><p className="muted">Use R2 para áudios, capas, imagens e arquivos auxiliares.</p></div></div><div className="admin-form-grid"><label>Arquivo<input type="file" accept="audio/*,image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>{file ? <div className="admin-preview-card"><span className="pill">{file.type || 'arquivo'}</span><strong>{file.name}</strong><p className="muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div> : null}</div><button className="admin-clean-button primary" type="button" onClick={uploadR2} disabled={!file || status === 'signing' || status === 'uploading'}>{status === 'signing' ? 'Preparando...' : status === 'uploading' ? `Enviando ${progress}%` : 'Enviar para R2'}</button>{status === 'uploading' ? <div className="progress"><span style={{ width: `${progress}%` }} /></div> : null}{status === 'done' && result ? <p className="admin-save-success">Arquivo enviado: {result.publicUrl}</p> : null}{status === 'error' && error ? <p className="admin-save-error">{error}</p> : null}</section>
  </>;
}
