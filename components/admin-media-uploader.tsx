'use client';

import { useState } from 'react';

type UploadResult = { key: string; publicUrl: string; uploadUrl: string; expiresIn: number };

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

export function AdminMediaUploader({ productId, productName, migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: AdminMediaUploaderProps = {}) {
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
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          folder: mediaFolder(file),
        }),
      });
      const signed = await signedResponse.json();
      if (!signedResponse.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload.');

      setStatus('uploading');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signed.uploadUrl);
        if (file.type) xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (event) => event.lengthComputable && setProgress(Math.round((event.loaded / event.total) * 100));
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou com status ${xhr.status}. Verifique CORS do bucket R2.`));
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

  if (migrationOnly) {
    return (
      <section className="media-migration-compact">
        <div>
          <span className="admin-clean-eyebrow">Mídia do produto</span>
          <strong>Vídeos agora serão enviados pelo Cloudflare Stream</strong>
          <p className="admin-clean-muted">A área de migração Drive → R2 foi removida. Use a aba Mídia para acompanhar a nova estrutura: Stream para vídeos e R2 para áudios/imagens.</p>
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
            <h2>{productName ? `Biblioteca de vídeo · ${productName}` : 'Biblioteca de vídeo'}</h2>
            <p className="muted">Suba os vídeos manualmente no painel do Cloudflare Stream. Em seguida, a próxima etapa será sincronizar os UIDs com as aulas do Hub.</p>
          </div>
          <span className="admin-clean-pill success">Stream ativo</span>
        </div>

        <div className="admin-grid admin-section">
          <article className="admin-stat"><span>Aulas</span><strong>{totalLessons}</strong><p className="muted">Conteúdos vinculados ao produto.</p></article>
          <article className="admin-stat"><span>Origem atual</span><strong>{driveLessons}</strong><p className="muted">Ainda usam Drive até receber UID do Stream.</p></article>
          <article className="admin-stat"><span>Otimizadas</span><strong>{migratedLessons}</strong><p className="muted">Já usam uma origem interna/media_url.</p></article>
        </div>

        <div className="admin-help-box">
          <strong>Novo fluxo de vídeos</strong>
          <p className="muted">1. Envie o módulo no Cloudflare Stream. 2. Aguarde o processamento. 3. Use a sincronização por nome/UID quando ativarmos a integração da API.</p>
          <code>Cloudflare Stream UID → aula do Hub → player adaptativo</code>
        </div>
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
