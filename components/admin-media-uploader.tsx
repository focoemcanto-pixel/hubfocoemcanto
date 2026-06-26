'use client';

import { useState } from 'react';

type UploadResult = {
  key: string;
  publicUrl: string;
  uploadUrl: string;
  expiresIn: number;
};

function mediaFolder(file: File) {
  if (file.type.startsWith('video/')) return 'videos/originals';
  if (file.type.startsWith('audio/')) return 'audios/originals';
  if (file.type.startsWith('image/')) return 'images';
  return 'files';
}

export function AdminMediaUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

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

  return (
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
  );
}
