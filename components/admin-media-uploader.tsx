'use client';

import { useMemo, useRef, useState } from 'react';

type UploadResult = { key: string; publicUrl: string; uploadUrl: string; expiresIn: number };
type StreamItemStatus = 'queued' | 'creating' | 'uploading' | 'saving' | 'done' | 'error';
type StreamQueueItem = {
  id: string;
  file: File;
  name: string;
  relativePath: string;
  progress: number;
  status: StreamItemStatus;
  uid?: string;
  matched?: boolean;
  exerciseTitle?: string | null;
  error?: string;
};

type AdminMediaUploaderProps = {
  productId?: string;
  productName?: string | null;
  migrationOnly?: boolean;
  totalLessons?: number;
  migratedLessons?: number;
  driveLessons?: number;
};

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

export function AdminMediaUploader({ productId, productName, migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: AdminMediaUploaderProps = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [streamQueue, setStreamQueue] = useState<StreamQueueItem[]>([]);
  const [streamRunning, setStreamRunning] = useState(false);
  const [streamError, setStreamError] = useState('');
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const streamStats = useMemo(() => {
    const total = streamQueue.length;
    const done = streamQueue.filter((item) => item.status === 'done').length;
    const errors = streamQueue.filter((item) => item.status === 'error').length;
    const matched = streamQueue.filter((item) => item.matched).length;
    const overall = total ? Math.round(streamQueue.reduce((sum, item) => sum + item.progress, 0) / total) : 0;
    return { total, done, errors, matched, overall };
  }, [streamQueue]);

  function updateStreamItem(id: string, patch: Partial<StreamQueueItem>) {
    setStreamQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addStreamFiles(files: FileList | null) {
    const incoming = Array.from(files || []).filter((item) => isVideoFile(item) && !item.name.startsWith('._'));
    if (!incoming.length) return;
    setStreamQueue((current) => {
      const known = new Set(current.map((item) => item.id));
      const next = incoming.map((file) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        return { id: fileKey(file), file, name: file.name, relativePath, progress: 0, status: 'queued' as const };
      }).filter((item) => !known.has(item.id));
      return [...current, ...next];
    });
  }

  async function uploadStreamItem(item: StreamQueueItem) {
    updateStreamItem(item.id, { status: 'creating', error: '' });
    const createResponse = await fetch('/api/admin/media/stream-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: item.name, relativePath: item.relativePath, productId }),
    });
    const createJson = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) throw new Error(createJson?.message || createJson?.error || 'Não foi possível criar upload no Stream.');

    updateStreamItem(item.id, { status: 'uploading', uid: createJson.uid, progress: 1 });
    await putWithProgress(createJson.uploadURL, item.file, (nextProgress) => updateStreamItem(item.id, { progress: Math.max(1, nextProgress) }));

    updateStreamItem(item.id, { status: 'saving', progress: 100 });
    const completeResponse = await fetch('/api/admin/media/stream-upload-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: createJson.uid, fileName: item.name, relativePath: item.relativePath, productId }),
    });
    const completeJson = await completeResponse.json().catch(() => ({}));
    if (!completeResponse.ok) throw new Error(completeJson?.message || completeJson?.error || 'Upload enviado, mas não consegui salvar no Hub.');

    updateStreamItem(item.id, { status: 'done', matched: completeJson.matched, exerciseTitle: completeJson.exerciseTitle || null, uid: createJson.uid, progress: 100 });
  }

  async function startStreamUpload() {
    const queue = streamQueue.filter((item) => item.status === 'queued' || item.status === 'error');
    if (!queue.length) return;
    setStreamRunning(true);
    setStreamError('');
    const concurrency = 3;
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
            <p className="muted">Selecione uma pasta ou vários vídeos. O Hub envia para o Stream, salva o UID e tenta vincular automaticamente com a aula pelo nome.</p>
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
          <button className="admin-clean-button primary" type="button" onClick={startStreamUpload} disabled={streamRunning || !streamQueue.length}>{streamRunning ? `Enviando ${streamStats.overall}%` : 'Iniciar upload Stream'}</button>
          <button className="admin-clean-button secondary" type="button" onClick={() => setStreamQueue([])} disabled={streamRunning}>Limpar fila</button>
        </div>

        <div className="admin-help-box">
          <strong>Dica importante</strong>
          <p className="muted">Arquivos iniciados por <code>._</code> são ignorados automaticamente, porque são metadados do macOS e não vídeos reais.</p>
        </div>

        {streamError ? <p className="admin-save-error">{streamError}</p> : null}
        {streamStats.errors ? <p className="admin-save-error">{streamStats.errors} vídeo(s) falharam. Corrija e clique novamente para tentar reenviar.</p> : null}

        {streamQueue.length ? (
          <div className="admin-list media-migration-results">
            {streamQueue.slice(0, 80).map((item) => (
              <div className="admin-row" key={item.id}>
                <div>
                  <span className={`admin-clean-pill ${item.status === 'done' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}`}>{item.status === 'done' ? 'Enviado' : item.status === 'error' ? 'Falhou' : item.status === 'queued' ? 'Na fila' : item.status === 'saving' ? 'Salvando' : 'Enviando'}</span>
                  <h3>{item.name}</h3>
                  <p className="muted">{item.exerciseTitle ? `Vinculado: ${item.exerciseTitle}` : item.uid ? `UID: ${item.uid}` : item.relativePath}{item.error ? ` · ${item.error}` : ''}</p>
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
