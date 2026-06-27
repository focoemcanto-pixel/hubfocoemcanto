'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type UploadResult = { key: string; publicUrl: string; uploadUrl: string; expiresIn: number };
type StreamItemStatus = 'queued' | 'creating' | 'uploading' | 'saving' | 'done' | 'error' | 'cancelled';
type StreamQueueItem = {
  id: string;
  file?: File;
  name: string;
  relativePath: string;
  size?: number;
  type?: string;
  progress: number;
  status: StreamItemStatus;
  uid?: string;
  uploadUrl?: string;
  attempts?: number;
  matched?: boolean;
  exerciseTitle?: string | null;
  error?: string;
  needsFile?: boolean;
};

type AdminMediaUploaderProps = {
  productId?: string;
  productName?: string | null;
  migrationOnly?: boolean;
  totalLessons?: number;
  migratedLessons?: number;
  driveLessons?: number;
};

const RETRY_LIMIT = 3;
const RETRY_DELAYS = [2500, 7000, 15000];
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function mediaFolder(file: File) {
  if (file.type.startsWith('audio/')) return 'audios/originals';
  if (file.type.startsWith('image/')) return 'images';
  if (file.type.startsWith('video/')) return 'videos/backup';
  return 'files';
}

function fileKey(file: File) {
  return `${(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}-${file.size}-${file.lastModified}`;
}

function isVideoFile(file: File) {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}

async function putWithProgress(url: string, file: File, onProgress: (progress: number) => void) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou com status ${xhr.status}.`));
    xhr.onerror = () => reject(new Error('Upload interrompido. Verifique sua conexão.'));
    xhr.send(file);
  });
}

async function postFormWithProgress(url: string, file: File, onProgress: (progress: number) => void) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.open('POST', url);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Cloudflare Stream recusou o arquivo com status ${xhr.status}.`));
    xhr.onerror = () => reject(new Error('Upload interrompido. Verifique sua conexão.'));
    xhr.send(form);
  });
}

export function AdminMediaUploader({ productId, productName, migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: AdminMediaUploaderProps = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [streamQueue, setStreamQueue] = useState<StreamQueueItem[]>([]);
  const [streamRunning, setStreamRunning] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [pendingRestored, setPendingRestored] = useState(0);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const streamStats = useMemo(() => {
    const total = streamQueue.length;
    const done = streamQueue.filter((item) => item.status === 'done').length;
    const errors = streamQueue.filter((item) => item.status === 'error').length;
    const matched = streamQueue.filter((item) => item.matched).length;
    const needsFile = streamQueue.filter((item) => item.needsFile).length;
    const overall = total ? Math.round(streamQueue.reduce((sum, item) => sum + item.progress, 0) / total) : 0;
    return { total, done, errors, matched, needsFile, overall };
  }, [streamQueue]);

  useEffect(() => {
    if (!productId || migrationOnly) return;
    void loadPendingQueue();
  }, [productId, migrationOnly]);

  function updateStreamItem(id: string, patch: Partial<StreamQueueItem>) {
    setStreamQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function saveQueueItem(item: StreamQueueItem, patch: Partial<StreamQueueItem> = {}) {
    if (!productId) return;
    const merged = { ...item, ...patch };
    await fetch('/api/admin/media/stream-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        fileKey: merged.id,
        fileName: merged.name,
        relativePath: merged.relativePath,
        fileSize: merged.size || merged.file?.size || null,
        fileType: merged.type || merged.file?.type || null,
        status: merged.status,
        progress: merged.progress,
        streamUid: merged.uid || '',
        uploadUrl: merged.uploadUrl || '',
        attempts: merged.attempts || 0,
        lastError: merged.error || '',
        matchedExerciseTitle: merged.exerciseTitle || null,
        raw: { needsFile: merged.needsFile || false },
      }),
    }).catch(() => null);
  }

  async function patchQueueItem(item: StreamQueueItem, patch: Partial<StreamQueueItem>) {
    updateStreamItem(item.id, patch);
    if (!productId) return;
    await fetch('/api/admin/media/stream-queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        fileKey: item.id,
        status: patch.status,
        progress: patch.progress,
        streamUid: patch.uid,
        uploadUrl: patch.uploadUrl,
        attempts: patch.attempts,
        lastError: patch.error,
        matchedExerciseTitle: patch.exerciseTitle,
      }),
    }).catch(() => null);
  }

  async function loadPendingQueue() {
    if (!productId) return;
    const response = await fetch(`/api/admin/media/stream-queue?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const json = await response.json().catch(() => ({}));
    const items = Array.isArray(json.items) ? json.items : [];
    const restored: StreamQueueItem[] = items.map((item: any) => ({
      id: String(item.file_key),
      name: String(item.file_name || 'Vídeo'),
      relativePath: String(item.relative_path || item.file_name || 'Vídeo'),
      size: Number(item.file_size || 0) || undefined,
      type: String(item.file_type || ''),
      progress: Number(item.progress || 0),
      status: item.status === 'uploading' || item.status === 'creating' || item.status === 'saving' ? 'error' : String(item.status || 'queued') as StreamItemStatus,
      uid: item.stream_uid || undefined,
      uploadUrl: item.upload_url || undefined,
      attempts: Number(item.attempts || 0),
      exerciseTitle: item.matched_exercise_title || null,
      error: item.last_error || (['uploading', 'creating', 'saving'].includes(String(item.status)) ? 'Upload interrompido. Selecione o arquivo novamente para continuar.' : ''),
      needsFile: true,
    }));
    if (restored.length) {
      setStreamQueue((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...restored.filter((item) => !known.has(item.id))];
      });
      setPendingRestored(restored.length);
    }
  }

  function addStreamFiles(files: FileList | null) {
    const incoming = Array.from(files || []).filter((item) => isVideoFile(item) && !item.name.startsWith('._'));
    if (!incoming.length) return;
    setStreamQueue((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      incoming.forEach((file) => {
        const id = fileKey(file);
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const previous = byId.get(id);
        const next: StreamQueueItem = {
          ...(previous || {}),
          id,
          file,
          name: file.name,
          relativePath,
          size: file.size,
          type: file.type,
          progress: previous?.status === 'done' ? 100 : previous?.progress || 0,
          status: previous?.status === 'done' ? 'done' : 'queued',
          needsFile: false,
          error: previous?.status === 'done' ? previous.error : '',
        };
        byId.set(id, next);
        void saveQueueItem(next);
      });
      return Array.from(byId.values());
    });
  }

  async function uploadStreamItem(item: StreamQueueItem) {
    if (!item.file) {
      await patchQueueItem(item, { status: 'error', error: 'Selecione este arquivo novamente para continuar.', needsFile: true });
      return;
    }

    let attempt = item.attempts || 0;
    while (attempt < RETRY_LIMIT) {
      try {
        attempt += 1;
        await patchQueueItem(item, { status: 'creating', error: '', attempts: attempt });
        const createResponse = await fetch('/api/admin/media/stream-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: item.name, relativePath: item.relativePath, productId }),
        });
        const createJson = await createResponse.json().catch(() => ({}));
        if (!createResponse.ok) throw new Error(createJson?.message || createJson?.error || 'Não foi possível criar upload no Stream.');

        await patchQueueItem(item, { status: 'uploading', uid: createJson.uid, uploadUrl: createJson.uploadURL, progress: 1, attempts: attempt });
        await postFormWithProgress(createJson.uploadURL, item.file, (nextProgress) => updateStreamItem(item.id, { progress: Math.max(1, nextProgress) }));

        await patchQueueItem(item, { status: 'saving', progress: 100, attempts: attempt });
        const completeResponse = await fetch('/api/admin/media/stream-upload-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: createJson.uid, fileName: item.name, relativePath: item.relativePath, productId }),
        });
        const completeJson = await completeResponse.json().catch(() => ({}));
        if (!completeResponse.ok) throw new Error(completeJson?.message || completeJson?.error || 'Upload enviado, mas não consegui salvar no Hub.');

        await patchQueueItem(item, { status: 'done', matched: completeJson.matched, exerciseTitle: completeJson.exerciseTitle || null, uid: createJson.uid, progress: 100, error: '', attempts: attempt });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        await patchQueueItem(item, { status: 'error', error: `${message} · tentativa ${attempt}/${RETRY_LIMIT}`, attempts: attempt });
        if (attempt >= RETRY_LIMIT) return;
        await wait(RETRY_DELAYS[attempt - 1] || 15000);
      }
    }
  }

  async function startStreamUpload() {
    const queue = streamQueue.filter((item) => (item.status === 'queued' || item.status === 'error') && !item.needsFile && item.status !== 'done');
    if (!queue.length) return;
    setStreamRunning(true);
    setStreamError('');
    const concurrency = 2;
    let cursor = 0;

    async function worker() {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        try { await uploadStreamItem(item); }
        catch (err) { updateStreamItem(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Erro desconhecido' }); }
      }
    }

    try { await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())); }
    catch (err) { setStreamError(err instanceof Error ? err.message : 'Erro desconhecido no lote.'); }
    finally { setStreamRunning(false); }
  }

  async function upload() {
    if (!file) return;
    setStatus('signing');
    setProgress(0);
    setResult(null);
    setError('');

    try {
      const signedResponse = await fetch('/api/admin/media/signed-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream', folder: mediaFolder(file) }),
      });
      const signed = await signedResponse.json();
      if (!signedResponse.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload.');

      setStatus('uploading');
      await putWithProgress(signed.uploadUrl, file, setProgress);
      setResult(signed);
      setProgress(100);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido ao enviar mídia.');
      setStatus('error');
    }
  }

  if (migrationOnly) {
    return (
      <section className="media-migration-compact">
        <div>
          <span className="admin-clean-eyebrow">Mídia do produto</span>
          <strong>Vídeos agora serão enviados pelo Cloudflare Stream</strong>
          <p className="admin-clean-muted">A migração Drive → R2 foi removida. Use a aba Mídia para enviar vídeos em lote ao Stream e áudios/imagens ao R2.</p>
        </div>
        <a className="admin-clean-button primary" href={productId ? `/admin/produtos/${productId}?tab=midia` : '#'}>Abrir Mídia</a>
      </section>
    );
  }

  return (
    <>
      <section className="card admin-section media-migration-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cloudflare Stream</p>
            <h2>{productName ? `Upload em lote · ${productName}` : 'Upload em lote'}</h2>
            <p className="muted">Selecione uma pasta ou vários vídeos. O Hub salva a fila, tenta reenviar falhas e vincula automaticamente pelo nome.</p>
          </div>
          <span className="admin-clean-pill success">{streamRunning ? 'Enviando...' : 'Pronto'}</span>
        </div>

        <div className="admin-grid admin-section">
          <article className="admin-stat"><span>Na fila</span><strong>{streamStats.total}</strong><p className="muted">Vídeos selecionados.</p></article>
          <article className="admin-stat"><span>Enviados</span><strong>{streamStats.done}</strong><p className="muted">UID salvo no Hub.</p></article>
          <article className="admin-stat"><span>Vinculados</span><strong>{streamStats.matched}</strong><p className="muted">Aulas encontradas pelo nome.</p></article>
        </div>

        {streamQueue.length ? <div className="progress media-migration-progress"><span style={{ width: `${streamStats.overall}%` }} /></div> : null}

        <div className="media-migration-toolbar">
          <input ref={folderInputRef} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple style={{ display: 'none' }} onChange={(event) => addStreamFiles(event.target.files)} />
          <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} style={{ display: 'none' }} id="stream-folder-input" onChange={(event) => addStreamFiles(event.target.files)} />
          <button className="admin-clean-button secondary" type="button" onClick={() => folderInputRef.current?.click()}>Selecionar vídeos</button>
          <label className="admin-clean-button secondary" htmlFor="stream-folder-input">Selecionar pasta</label>
          <button className="admin-clean-button primary" type="button" onClick={startStreamUpload} disabled={streamRunning || !streamQueue.length || streamQueue.every((item) => item.status === 'done' || item.needsFile)}>{streamRunning ? `Enviando ${streamStats.overall}%` : 'Iniciar / continuar'}</button>
          <button className="admin-clean-button secondary" type="button" onClick={() => setStreamQueue([])} disabled={streamRunning}>Limpar tela</button>
        </div>

        <div className="admin-help-box">
          <strong>Fila resiliente</strong>
          <p className="muted">Se a internet cair, os vídeos já concluídos ficam salvos. Ao voltar, selecione a mesma pasta e clique em continuar. O Hub ignora concluídos e tenta novamente os pendentes.</p>
          {pendingRestored ? <p className="admin-save-success">{pendingRestored} upload(s) pendente(s) encontrados no banco.</p> : null}
          {streamStats.needsFile ? <p className="admin-save-error">{streamStats.needsFile} item(ns) precisam que você selecione novamente os arquivos locais.</p> : null}
        </div>

        {streamError ? <p className="admin-save-error">{streamError}</p> : null}
        {streamStats.errors ? <p className="admin-save-error">{streamStats.errors} vídeo(s) falharam. O Hub tenta até {RETRY_LIMIT} vezes. Você pode clicar em continuar para tentar novamente.</p> : null}

        {streamQueue.length ? (
          <div className="admin-list media-migration-results">
            {streamQueue.slice(0, 120).map((item) => (
              <div className="admin-row" key={item.id}>
                <div>
                  <span className={`admin-clean-pill ${item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}`}>{item.status === 'done' ? 'Enviado' : item.needsFile ? 'Reanexar' : item.status === 'error' ? 'Falhou' : item.status === 'queued' ? 'Na fila' : item.status === 'saving' ? 'Salvando' : 'Enviando'}</span>
                  <h3>{item.name}</h3>
                  <p className="muted">{item.exerciseTitle ? `Vinculado: ${item.exerciseTitle}` : item.uid ? `UID: ${item.uid}` : item.relativePath}{item.attempts ? ` · tentativas: ${item.attempts}` : ''}{item.error ? ` · ${item.error}` : ''}</p>
                </div>
                <strong>{item.progress}%</strong>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cloudflare R2</p>
            <h2>Upload de áudios e imagens</h2>
            <p className="muted">Use R2 para áudios de treino, capas, imagens e arquivos auxiliares. Vídeos principais devem ir para o Cloudflare Stream.</p>
          </div>
        </div>

        <div className="admin-form-grid">
          <label>Arquivo
            <input type="file" accept="audio/*,image/*,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
          {file ? <div className="admin-preview-card"><span className="pill">{file.type || 'arquivo'}</span><strong>{file.name}</strong><p className="muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div> : null}
        </div>

        <button className="admin-clean-button primary" type="button" onClick={upload} disabled={!file || status === 'signing' || status === 'uploading'}>
          {status === 'signing' ? 'Preparando...' : status === 'uploading' ? `Enviando ${progress}%` : 'Enviar para R2'}
        </button>

        {status === 'uploading' ? <div className="progress"><span style={{ width: `${progress}%` }} /></div> : null}
        {status === 'done' && result ? <p className="admin-save-success">Arquivo enviado: {result.publicUrl}</p> : null}
        {status === 'error' && error ? <p className="admin-save-error">{error}</p> : null}
      </section>
    </>
  );
}
