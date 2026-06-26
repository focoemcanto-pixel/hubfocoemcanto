'use client';

import { useState } from 'react';

type UploadResult = {
  key: string;
  publicUrl: string;
  uploadUrl: string;
  expiresIn: number;
};

type MigrationResult = {
  id: string;
  title?: string | null;
  status: string;
  reason?: string;
  detail?: string;
  mediaUrl?: string;
  folder?: string;
};

type AdminMediaUploaderProps = {
  productId?: string;
  productName?: string | null;
};

function mediaFolder(file: File) {
  if (file.type.startsWith('video/')) return 'videos/originals';
  if (file.type.startsWith('audio/')) return 'audios/originals';
  if (file.type.startsWith('image/')) return 'images';
  return 'files';
}

export function AdminMediaUploader({ productId, productName }: AdminMediaUploaderProps = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [migrationResults, setMigrationResults] = useState<MigrationResult[]>([]);
  const [migrationError, setMigrationError] = useState('');

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
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signed.uploadUrl);
        if (file.type) xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload falhou com status ${xhr.status}. Verifique CORS do bucket R2.`));
        };
        xhr.onerror = () => reject(new Error('Upload bloqueado. Verifique a política CORS do bucket R2.'));
        xhr.send(file);
      });

      setResult(signed);
      setProgress(100);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido ao enviar mídia.');
      setStatus('error');
    }
  }

  async function migrateDriveBatch(limit = 1) {
    setMigrationStatus('running');
    setMigrationError('');
    try {
      const response = await fetch('/api/admin/media/migrate-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit, productId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.message || json?.error || 'Migração falhou.');
      setMigrationResults((current) => [...(json.results || []), ...current].slice(0, 30));
      setMigrationStatus('done');
    } catch (err) {
      setMigrationError(err instanceof Error ? err.message : 'Erro desconhecido na migração.');
      setMigrationStatus('error');
    }
  }

  return (
    <>
      <section className="card admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cloudflare R2</p>
            <h2>Upload de mídia</h2>
            <p className="muted">Envie vídeos, áudios e imagens para o bucket configurado nas variáveis do projeto.</p>
          </div>
        </div>

        <div className="admin-form-grid">
          <label>
            Arquivo
            <input
              type="file"
              accept="video/*,audio/*,image/*,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>

          {file ? (
            <div className="admin-preview-card">
              <span className="pill">{file.type || 'arquivo'}</span>
              <strong>{file.name}</strong>
              <p className="muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : null}

          <button className="button" type="button" onClick={upload} disabled={!file || status === 'signing' || status === 'uploading'}>
            {status === 'signing' ? 'Preparando...' : status === 'uploading' ? `Enviando ${progress}%` : 'Enviar para R2'}
          </button>
        </div>

        {status === 'uploading' ? <div className="progress"><span style={{ width: `${progress}%` }} /></div> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {result ? (
          <div className="admin-result-box">
            <p className="eyebrow">Upload concluído</p>
            <strong>URL pública</strong>
            <code>{result.publicUrl}</code>
            <button className="button secondary" type="button" onClick={() => navigator.clipboard?.writeText(result.publicUrl)}>
              Copiar URL
            </button>
            <p className="muted">Essa URL já pode ser usada em mídia comum. Para streaming adaptativo, o próximo passo é converter esse arquivo em HLS e salvar o master.m3u8.</p>
          </div>
        ) : null}

        <div className="admin-help-box">
          <strong>Antes de testar</strong>
          <p className="muted">O bucket R2 precisa permitir CORS para uploads PUT vindos do domínio do Hub. Se aparecer erro de CORS, configure a política do bucket.</p>
        </div>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Migração automática</p>
            <h2>{productName ? `Drive para R2 · ${productName}` : 'Drive para R2'}</h2>
            <p className="muted">Migra aulas deste produto para pastas organizadas por produto e módulo, preservando cortes e mantendo Drive como fallback.</p>
          </div>
        </div>

        <div className="admin-clean-actions">
          <button className="button" type="button" onClick={() => migrateDriveBatch(1)} disabled={migrationStatus === 'running'}>
            {migrationStatus === 'running' ? 'Migrando...' : 'Migrar 1 aula'}
          </button>
          <button className="button secondary" type="button" onClick={() => migrateDriveBatch(5)} disabled={migrationStatus === 'running'}>
            Migrar 5 aulas
          </button>
        </div>
        <p className="muted">Destino exemplo: produtos/{productName ? productName.toLowerCase().replace(/\s+/g, '-') : 'produto'}/modulo/originals/video.mp4</p>
        {migrationError ? <p className="error-text">{migrationError}</p> : null}

        {migrationResults.length > 0 ? (
          <div className="admin-list">
            {migrationResults.map((item, index) => (
              <div className="admin-row" key={`${item.id}-${index}`}>
                <div>
                  <span className="pill">{item.status}</span>
                  <h3>{item.title || item.id}</h3>
                  <p className="muted">{item.folder || item.mediaUrl || item.reason || item.detail || 'Processado'}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
