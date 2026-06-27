'use client';

import { useState } from 'react';

type Props = { productId?: string; productName?: string | null };
type Row = { name: string; status: string; detail?: string };

export function AdminMediaUploader({ productId, productName }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  function setRow(name: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => row.name === name ? { ...row, ...patch } : row));
  }

  async function sendFiles(files: FileList | null) {
    const videos = Array.from(files || []).filter((file) => file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name));
    if (!videos.length) return;
    setRows(videos.map((file) => ({ name: file.name, status: 'na fila' })));
    setRunning(true);

    for (const file of videos) {
      try {
        setRow(file.name, { status: 'criando envio' });
        const create = await fetch('/api/admin/media/stream-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, relativePath: file.name, productId }),
        });
        const created = await create.json();
        if (!create.ok) throw new Error(created?.message || created?.error || 'falha ao criar envio');

        setRow(file.name, { status: 'enviando', detail: created.uid });
        const form = new FormData();
        form.append('file', file, file.name);
        const sent = await fetch(created.uploadURL, { method: 'POST', body: form });
        if (!sent.ok) throw new Error(`stream ${sent.status}`);

        setRow(file.name, { status: 'salvando', detail: created.uid });
        const done = await fetch('/api/admin/media/stream-upload-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: created.uid, fileName: file.name, relativePath: file.name, productId }),
        });
        const saved = await done.json();
        if (!done.ok) throw new Error(saved?.message || saved?.error || 'falha ao salvar');
        setRow(file.name, { status: saved.matched ? 'enviado e vinculado' : 'enviado', detail: created.uid });
      } catch (error) {
        setRow(file.name, { status: 'falhou', detail: error instanceof Error ? error.message : 'erro desconhecido' });
      }
    }
    setRunning(false);
  }

  return (
    <section className="card admin-section media-migration-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Cloudflare Stream</p>
          <h2>{productName ? `Upload seguro · ${productName}` : 'Upload seguro'}</h2>
          <p className="muted">Teste simplificado: envie um vídeo por vez para validar o Stream.</p>
        </div>
      </div>
      <div className="admin-form-grid">
        <label>Vídeos
          <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple disabled={running} onChange={(event) => sendFiles(event.target.files)} />
        </label>
      </div>
      {rows.length ? (
        <div className="admin-list media-migration-results">
          {rows.map((row) => <div className="admin-row" key={row.name}><div><h3>{row.name}</h3><p className="muted">{row.status}{row.detail ? ` · ${row.detail}` : ''}</p></div></div>)}
        </div>
      ) : null}
    </section>
  );
}
