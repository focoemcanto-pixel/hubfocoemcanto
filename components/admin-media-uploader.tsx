'use client';

import { useEffect, useMemo, useState } from 'react';

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
  moduleTitle?: string | null;
};

type LessonExample = {
  id: string;
  title?: string | null;
  slug?: string | null;
  status: 'r2' | 'drive' | 'empty';
};

type ModuleSummary = {
  id: string;
  title: string;
  total: number;
  migrated: number;
  pending: number;
  examples?: LessonExample[];
};

type AdminMediaUploaderProps = {
  productId?: string;
  productName?: string | null;
  migrationOnly?: boolean;
  totalLessons?: number;
  migratedLessons?: number;
  driveLessons?: number;
  moduleSummaries?: ModuleSummary[];
};

function mediaFolder(file: File) {
  if (file.type.startsWith('video/')) return 'videos/originals';
  if (file.type.startsWith('audio/')) return 'audios/originals';
  if (file.type.startsWith('image/')) return 'images';
  return 'files';
}

function statusLabel(status: string) {
  if (status === 'migrated') return 'Migrado';
  if (status === 'failed') return 'Falhou';
  if (status === 'skipped') return 'Ignorado';
  return status || 'Processado';
}

function statusClass(status: string) {
  if (status === 'migrated') return 'admin-clean-pill success';
  if (status === 'failed') return 'admin-clean-pill danger';
  if (status === 'skipped') return 'admin-clean-pill warning';
  return 'admin-clean-pill';
}

function moduleStatus(module: ModuleSummary) {
  if (module.total === 0) return { label: 'Vazio', className: 'admin-clean-pill' };
  if (module.pending === 0) return { label: 'Concluído', className: 'admin-clean-pill success' };
  if (module.migrated > 0) return { label: 'Parcial', className: 'admin-clean-pill warning' };
  return { label: 'Pendente', className: 'admin-clean-pill danger' };
}

function lessonStatusLabel(status: LessonExample['status']) {
  if (status === 'r2') return 'R2';
  if (status === 'drive') return 'Drive';
  return 'Sem mídia';
}

export function AdminMediaUploader({ productId, productName, migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0, moduleSummaries = [] }: AdminMediaUploaderProps = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [migrationResults, setMigrationResults] = useState<MigrationResult[]>([]);
  const [migrationError, setMigrationError] = useState('');
  const [lastBatchSize, setLastBatchSize] = useState(0);
  const [statusLoading, setStatusLoading] = useState(false);
  const [liveStatus, setLiveStatus] = useState<{ total: number; migrated: number; pending: number; modules: ModuleSummary[] } | null>(null);

  async function refreshMigrationStatus() {
    if (!productId) return;
    setStatusLoading(true);
    try {
      const response = await fetch(`/api/admin/media/migration-status?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' });
      const json = await response.json().catch(() => null);
      if (response.ok && json) {
        setLiveStatus({
          total: Number(json.total || 0),
          migrated: Number(json.migrated || 0),
          pending: Number(json.pending || 0),
          modules: (json.modules || []) as ModuleSummary[],
        });
      }
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    refreshMigrationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const baseTotal = liveStatus?.total ?? totalLessons;
  const baseMigrated = liveStatus?.migrated ?? migratedLessons;
  const basePending = liveStatus?.pending ?? driveLessons;
  const modules = liveStatus?.modules?.length ? liveStatus.modules : moduleSummaries;
  const migratedNow = migrationResults.filter((item) => item.status === 'migrated').length;
  const displayMigrated = baseMigrated + migratedNow;
  const displayPending = Math.max(0, basePending - migratedNow);
  const percent = baseTotal > 0 ? Math.min(100, Math.round((displayMigrated / baseTotal) * 100)) : 0;
  const destinationPreview = useMemo(() => `produtos/${(productName || 'produto').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'produto'}/nome-do-modulo/originals/nome-da-aula.mp4`, [productName]);

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
    if (!productId) {
      setMigrationError('Produto não identificado. Abra a migração dentro de um produto.');
      setMigrationStatus('error');
      return;
    }

    setLastBatchSize(limit);
    setMigrationStatus('running');
    setMigrationError('');
    try {
      const response = await fetch('/api/admin/media/migrate-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit, productId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.message || json?.error || `Migração falhou (${response.status}).`);
      const results = (json.results || []) as MigrationResult[];
      setMigrationResults((current) => [...results, ...current].slice(0, 30));
      if (!results.length) setMigrationError(json?.message || 'Nenhuma aula pendente encontrada para este produto.');
      setMigrationStatus('done');
      await refreshMigrationStatus();
    } catch (err) {
      setMigrationError(err instanceof Error ? err.message : 'Erro desconhecido na migração.');
      setMigrationStatus('error');
    }
  }

  const migrationCard = (
    <section className="card admin-section media-migration-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Migração inteligente</p>
          <h2>{productName ? `Drive → R2 · ${productName}` : 'Drive → R2'}</h2>
          <p className="muted">O Hub baixa as aulas já vinculadas, publica no Cloudflare R2 e organiza tudo por produto, módulo e aula.</p>
        </div>
        <span className="admin-clean-pill">{statusLoading ? 'Atualizando...' : `${percent}% no R2`}</span>
      </div>

      <div className="admin-grid admin-section">
        <article className="admin-stat"><span>Total</span><strong>{baseTotal || '—'}</strong><p className="muted">Aulas vinculadas.</p></article>
        <article className="admin-stat"><span>Migradas</span><strong>{displayMigrated}</strong><p className="muted">Já usam R2.</p></article>
        <article className="admin-stat"><span>Pendentes</span><strong>{displayPending || '0'}</strong><p className="muted">Ainda usam Drive.</p></article>
      </div>

      <div className="progress media-migration-progress"><span style={{ width: `${percent}%` }} /></div>

      <div className="admin-help-box">
        <strong>{displayPending === 0 ? 'Tudo migrado para R2' : 'O que será migrado agora?'}</strong>
        <p className="muted">{displayPending === 0 ? 'Todas as aulas deste produto já possuem media_url no R2. O Drive permanece salvo apenas como fallback.' : 'As próximas aulas pendentes deste produto. Os cortes continuam salvos na aula e o link do Drive fica como fallback de segurança.'}</p>
        <code>{destinationPreview}</code>
      </div>

      <div className="admin-clean-actions">
        <button className="admin-clean-button primary" type="button" onClick={() => migrateDriveBatch(1)} disabled={migrationStatus === 'running' || displayPending === 0}>
          {migrationStatus === 'running' && lastBatchSize === 1 ? 'Migrando 1 aula...' : 'Migrar 1 aula'}
        </button>
        <button className="admin-clean-button secondary" type="button" onClick={() => migrateDriveBatch(5)} disabled={migrationStatus === 'running' || displayPending === 0}>
          {migrationStatus === 'running' && lastBatchSize === 5 ? 'Migrando 5 aulas...' : 'Migrar 5 aulas'}
        </button>
        <button className="admin-clean-button secondary" type="button" onClick={refreshMigrationStatus} disabled={statusLoading}>
          Atualizar mapa
        </button>
      </div>

      <div className="admin-help-box">
        <strong>Mapa da migração por módulo</strong>
        <div className="admin-list media-migration-results">
          {modules.map((module) => {
            const statusInfo = moduleStatus(module);
            const modulePercent = module.total > 0 ? Math.round((module.migrated / module.total) * 100) : 0;
            return (
              <div className="admin-row" key={module.id}>
                <div>
                  <span className={statusInfo.className}>{statusInfo.label}</span>
                  <h3>{module.title}</h3>
                  <p className="muted">{module.migrated}/{module.total} no R2 · {module.pending} pendentes · {modulePercent}% concluído</p>
                  {module.examples?.length ? (
                    <p className="muted">
                      {module.examples.map((lesson) => `${lessonStatusLabel(lesson.status)}: ${lesson.title || lesson.slug || 'Aula'}`).join(' · ')}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!modules.length ? <p className="muted">Nenhum módulo encontrado neste produto.</p> : null}
        </div>
      </div>

      {migrationStatus === 'running' ? <p className="admin-save-success">Migração em andamento. Não feche esta tela até finalizar.</p> : null}
      {migrationStatus === 'done' && migrationResults.length > 0 ? <p className="admin-save-success">Migração concluída. Confira abaixo as aulas processadas.</p> : null}
      {migrationError ? <p className="admin-save-error">{migrationError}</p> : null}

      {migrationResults.length > 0 ? (
        <div className="admin-list media-migration-results">
          {migrationResults.map((item, index) => (
            <div className="admin-row" key={`${item.id}-${index}`}>
              <div>
                <span className={statusClass(item.status)}>{statusLabel(item.status)}</span>
                <h3>{item.title || item.id}</h3>
                <p className="muted">{item.moduleTitle ? `${item.moduleTitle} · ` : ''}{item.folder || item.mediaUrl || item.reason || item.detail || 'Processado'}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );

  if (migrationOnly) return migrationCard;

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

      {migrationCard}
    </>
  );
}
