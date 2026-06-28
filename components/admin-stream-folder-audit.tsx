'use client';

import { useRef, useState } from 'react';
import { FolderUp, Loader2 } from 'lucide-react';

type Props = {
  productId: string;
  moduleId?: string;
  createMissing?: boolean;
};

type AuditItem = {
  fileName: string;
  relativePath: string;
  action: string;
  reason: string;
  exerciseTitle?: string | null;
  streamUid?: string | null;
};

type AuditResult = {
  totalFiles?: number;
  uploadCount?: number;
  skipCount?: number;
  validStreamCount?: number;
  brokenStreamCount?: number;
  missingStreamCount?: number;
  newLessonCount?: number;
  mapped?: AuditItem[];
  message?: string;
  error?: string;
};

function filePath(file: File) {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function isIgnored(file: File) {
  const path = filePath(file);
  return file.name === '.DS_Store' || file.name.startsWith('._') || path.includes('/.DS_Store') || path.includes('/._');
}

function isVideo(file: File) {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}

function badge(item: AuditItem) {
  if (item.action === 'skip_valid_stream') return { label: 'Ignorar', tone: 'success' };
  if (item.action === 'upload_broken_stream') return { label: 'Reenviar', tone: 'danger' };
  if (item.action === 'upload_missing_stream') return { label: 'Enviar', tone: 'warning' };
  if (item.action === 'upload_new_lesson') return { label: 'Criar aula', tone: 'warning' };
  return { label: 'Sem ação', tone: 'warning' };
}

export function AdminStreamFolderAudit({ productId, moduleId, createMissing = true }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);

  async function run(files: FileList | null) {
    const selected = Array.from(files || []).filter((file) => !isIgnored(file) && isVideo(file));
    if (!selected.length) return;
    if (!moduleId) {
      setMessage('Selecione um módulo no card de destino antes de mapear a pasta.');
      return;
    }

    setLoading(true);
    setMessage('Analisando pasta e verificando os UIDs no Stream...');
    setResult(null);

    try {
      const response = await fetch('/api/admin/media/stream-folder-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          moduleId,
          createMissing,
          files: selected.map((file) => ({
            name: file.name,
            relativePath: filePath(file),
            size: file.size,
            type: file.type,
          })),
        }),
      });
      const json: AuditResult = await response.json().catch(() => ({}));
      if (!response.ok || json.error) throw new Error(json.message || json.error || 'Falha ao mapear pasta.');
      setResult(json);
      setMessage(`${json.uploadCount || 0} precisam subir · ${json.validStreamCount || 0} já estão OK · ${json.brokenStreamCount || 0} estão quebrados.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao mapear pasta.');
    }

    setLoading(false);
  }

  return (
    <section className="card admin-section media-migration-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Assistente de migração</p>
          <h2>Mapear pasta antes de subir</h2>
          <p className="muted">Escolha a pasta completa para saber o que já está válido, o que está quebrado e o que ainda precisa subir.</p>
        </div>
        <span className="admin-clean-pill warning">Pré-upload</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm"
        multiple
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        style={{ display: 'none' }}
        onChange={(event) => run(event.target.files)}
      />

      <button className="admin-clean-button secondary" type="button" disabled={loading || !moduleId} onClick={() => inputRef.current?.click()}>
        {loading ? <><Loader2 size={16} className="premium-video-spinner" /> Mapeando...</> : <><FolderUp size={16} /> Selecionar pasta para mapear</>}
      </button>

      {message ? <p className="muted">{message}</p> : null}

      {result ? (
        <div className="admin-help-box">
          <strong>Análise concluída</strong>
          <p className="muted">{result.totalFiles || 0} vídeos analisados · {result.uploadCount || 0} precisam subir · {result.skipCount || 0} serão ignorados.</p>
          <div className="admin-grid admin-section">
            <article className="admin-stat"><span>Já migrados</span><strong>{result.validStreamCount || 0}</strong><p className="muted">Stream válido.</p></article>
            <article className="admin-stat"><span>Sem Stream</span><strong>{result.missingStreamCount || 0}</strong><p className="muted">Precisa subir.</p></article>
            <article className="admin-stat"><span>Stream inválido</span><strong>{result.brokenStreamCount || 0}</strong><p className="muted">UID apagado.</p></article>
            <article className="admin-stat"><span>Sem aula</span><strong>{result.newLessonCount || 0}</strong><p className="muted">Pode criar aula.</p></article>
          </div>
          <button className="admin-clean-button secondary" type="button" onClick={() => setDetails((value) => !value)}>{details ? 'Ocultar detalhes' : 'Ver detalhes'}</button>
          {details ? (
            <div className="admin-list media-migration-results">
              {(result.mapped || []).slice(0, 160).map((item, index) => {
                const itemBadge = badge(item);
                return (
                  <div className="admin-row" key={`${item.relativePath}-${index}`}>
                    <div>
                      <span className={`admin-clean-pill ${itemBadge.tone}`}>{itemBadge.label}</span>
                      <h3>{item.fileName}</h3>
                      <p className="muted">{item.exerciseTitle || 'Sem aula correspondente'} · {item.reason}{item.streamUid ? ` · UID ${item.streamUid}` : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
