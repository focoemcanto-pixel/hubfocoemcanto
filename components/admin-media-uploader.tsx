'use client';

import { useEffect, useMemo, useState } from 'react';

type UploadResult = { key: string; publicUrl: string; uploadUrl: string; expiresIn: number };
type LessonStatus = 'r2' | 'drive' | 'empty';
type LessonRow = { id: string; title?: string | null; slug?: string | null; mediaType?: string | null; driveUrl?: string | null; mediaUrl?: string | null; status: LessonStatus };
type ModuleSummary = { id: string; title: string; total: number; migrated: number; pending: number; lessons: LessonRow[] };
type MigrationResult = { id: string; title?: string | null; status: string; reason?: string; detail?: string; mediaUrl?: string; folder?: string; moduleTitle?: string | null; step?: string };
type LibraryStatus = { total: number; migrated: number; pending: number; modules: ModuleSummary[] };

type AdminMediaUploaderProps = { productId?: string; productName?: string | null; migrationOnly?: boolean; totalLessons?: number; migratedLessons?: number; driveLessons?: number };

function mediaFolder(file: File) { if (file.type.startsWith('video/')) return 'videos/originals'; if (file.type.startsWith('audio/')) return 'audios/originals'; if (file.type.startsWith('image/')) return 'images'; return 'files'; }
function slug(value?: string | null) { return String(value || 'produto').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'produto'; }
function statusLabel(status: LessonStatus) { if (status === 'r2') return 'R2'; if (status === 'drive') return 'Drive'; return 'Sem mídia'; }
function resultLabel(status: string) { if (status === 'migrated') return 'Migrado'; if (status === 'failed') return 'Falhou'; if (status === 'skipped') return 'Ignorado'; return status || 'Processado'; }
function pillClass(status: string) { if (status === 'r2' || status === 'migrated') return 'admin-clean-pill success'; if (status === 'drive' || status === 'skipped') return 'admin-clean-pill warning'; if (status === 'failed') return 'admin-clean-pill danger'; return 'admin-clean-pill'; }

export function AdminMediaUploader({ productId, productName, migrationOnly = false, totalLessons = 0, migratedLessons = 0, driveLessons = 0 }: AdminMediaUploaderProps = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'signing' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [library, setLibrary] = useState<LibraryStatus>({ total: totalLessons, migrated: migratedLessons, pending: driveLessons, modules: [] });
  const [statusLoading, setStatusLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [migrationError, setMigrationError] = useState('');
  const [migrationResults, setMigrationResults] = useState<MigrationResult[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'r2'>('pending');

  const pendingLessons = useMemo(() => library.modules.flatMap((module) => module.lessons.filter((lesson) => lesson.status === 'drive')), [library.modules]);
  const selectedPending = useMemo(() => pendingLessons.filter((lesson) => selected.has(lesson.id)), [pendingLessons, selected]);
  const percent = library.total > 0 ? Math.round((library.migrated / library.total) * 100) : 0;
  const destinationPreview = `produtos/${slug(productName)}/nome-do-modulo/originals/nome-da-aula.mp4`;

  async function refreshMigrationStatus() {
    if (!productId) return;
    setStatusLoading(true);
    try {
      const response = await fetch(`/api/admin/media/migration-status?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json) throw new Error(json?.message || json?.error || 'Não foi possível carregar biblioteca.');
      const next = { total: Number(json.total || 0), migrated: Number(json.migrated || 0), pending: Number(json.pending || 0), modules: (json.modules || []) as ModuleSummary[] };
      setLibrary(next);
      setSelected((current) => {
        const valid = new Set(next.modules.flatMap((module) => module.lessons.filter((lesson) => lesson.status === 'drive').map((lesson) => lesson.id)));
        return new Set([...current].filter((id) => valid.has(id)));
      });
    } catch (err) { setMigrationError(err instanceof Error ? err.message : 'Erro ao carregar biblioteca.'); }
    finally { setStatusLoading(false); }
  }

  useEffect(() => { if (!migrationOnly) refreshMigrationStatus(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [productId, migrationOnly]);

  function toggleLesson(lesson: LessonRow) { if (lesson.status !== 'drive') return; setSelected((current) => { const next = new Set(current); next.has(lesson.id) ? next.delete(lesson.id) : next.add(lesson.id); return next; }); }
  function toggleModule(module: ModuleSummary) { const ids = module.lessons.filter((lesson) => lesson.status === 'drive').map((lesson) => lesson.id); setSelected((current) => { const next = new Set(current); const allSelected = ids.length > 0 && ids.every((id) => next.has(id)); ids.forEach((id) => allSelected ? next.delete(id) : next.add(id)); return next; }); }
  function selectAllPending() { setSelected(new Set(pendingLessons.map((lesson) => lesson.id))); }

  async function migrateOne(exerciseId: string) {
    const response = await fetch('/api/admin/media/migrate-drive-v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exerciseId, productId, limit: 1, force: true }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.message || json?.error || `Falha ao migrar ${exerciseId}`);
    return ((json.results || []) as MigrationResult[])[0] || { id: exerciseId, status: 'skipped', reason: 'sem resultado' };
  }

  async function migrateSelected() {
    if (!selectedPending.length) { setMigrationError('Selecione pelo menos uma aula pendente no Drive.'); setMigrationStatus('error'); return; }
    setMigrationStatus('running'); setMigrationError('');
    try {
      for (const lesson of selectedPending) { const item = await migrateOne(lesson.id); setMigrationResults((current) => [item, ...current].slice(0, 50)); }
      setMigrationStatus('done'); setSelected(new Set()); await refreshMigrationStatus();
    } catch (err) { setMigrationStatus('error'); setMigrationError(err instanceof Error ? err.message : 'Erro desconhecido na migração.'); }
  }

  async function upload() {
    if (!file) return;
    setStatus('signing'); setProgress(0); setResult(null); setError('');
    try {
      const signedResponse = await fetch('/api/admin/media/signed-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream', folder: mediaFolder(file) }) });
      const signed = await signedResponse.json();
      if (!signedResponse.ok) throw new Error(signed?.message || signed?.error || 'Não foi possível preparar o upload.');
      setStatus('uploading');
      await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('PUT', signed.uploadUrl); if (file.type) xhr.setRequestHeader('Content-Type', file.type); xhr.upload.onprogress = (event) => event.lengthComputable && setProgress(Math.round((event.loaded / event.total) * 100)); xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou com status ${xhr.status}. Verifique CORS do bucket R2.`)); xhr.onerror = () => reject(new Error('Upload bloqueado. Verifique a política CORS do bucket R2.')); xhr.send(file); });
      setResult(signed); setProgress(100); setStatus('done');
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro desconhecido ao enviar mídia.'); setStatus('error'); }
  }

  if (migrationOnly) return <section className="media-migration-compact"><div><span className="admin-clean-eyebrow">Mídia do produto</span><strong>Central de migração movida para a aba Mídia</strong><p className="admin-clean-muted">Conteúdo fica limpo para módulos e aulas. Use a aba Mídia para selecionar arquivos, módulos e migrar para R2.</p></div><a className="admin-clean-button primary" href={productId ? `/admin/produtos/${productId}?tab=midia` : '#'}>Abrir Mídia</a></section>;

  const migrationCard = <section className="card admin-section media-migration-card"><div className="section-heading"><div><p className="eyebrow">Central de migração</p><h2>{productName ? `Drive → R2 · ${productName}` : 'Drive → R2'}</h2><p className="muted">Selecione aulas, módulos ou o produto inteiro. O Hub baixa do Drive, envia ao R2 e mantém os cortes salvos.</p></div><span className="admin-clean-pill">{statusLoading ? 'Atualizando...' : `${percent}% no R2`}</span></div><div className="admin-grid admin-section"><article className="admin-stat"><span>Total</span><strong>{library.total || '—'}</strong><p className="muted">Aulas vinculadas.</p></article><article className="admin-stat"><span>No R2</span><strong>{library.migrated}</strong><p className="muted">Arquivos reais no domínio R2.</p></article><article className="admin-stat"><span>Selecionadas</span><strong>{selectedPending.length}</strong><p className="muted">Prontas para migrar.</p></article></div><div className="progress media-migration-progress"><span style={{ width: `${percent}%` }} /></div><div className="media-migration-toolbar"><button className="admin-clean-button primary" type="button" onClick={migrateSelected} disabled={migrationStatus === 'running' || selectedPending.length === 0}>{migrationStatus === 'running' ? 'Migrando selecionadas...' : `Migrar selecionadas (${selectedPending.length})`}</button><button className="admin-clean-button secondary" type="button" onClick={selectAllPending} disabled={!pendingLessons.length || migrationStatus === 'running'}>Selecionar pendentes ({pendingLessons.length})</button><button className="admin-clean-button secondary" type="button" onClick={() => setSelected(new Set())}>Limpar seleção</button><button className="admin-clean-button secondary" type="button" onClick={refreshMigrationStatus} disabled={statusLoading}>Atualizar mapa</button></div><div className="media-migration-filters"><button type="button" className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>Pendentes</button><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todas</button><button type="button" className={filter === 'r2' ? 'active' : ''} onClick={() => setFilter('r2')}>No R2</button></div><div className="admin-help-box"><strong>Destino organizado</strong><p className="muted">Cada arquivo vai para a pasta do produto e do módulo correto.</p><code>{destinationPreview}</code></div>{migrationStatus === 'running' ? <p className="admin-save-success">Migração em andamento. Não feche esta tela.</p> : null}{migrationStatus === 'done' ? <p className="admin-save-success">Migração concluída. O mapa foi atualizado.</p> : null}{migrationError ? <p className="admin-save-error">{migrationError}</p> : null}<div className="media-library-map">{library.modules.map((module) => { const pendingIds = module.lessons.filter((lesson) => lesson.status === 'drive').map((lesson) => lesson.id); const moduleSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id)); const visibleLessons = module.lessons.filter((lesson) => filter === 'all' ? true : filter === 'pending' ? lesson.status === 'drive' : lesson.status === 'r2'); if (!visibleLessons.length && filter !== 'all') return null; const modulePercent = module.total > 0 ? Math.round((module.migrated / module.total) * 100) : 0; return <article className="media-module-card" key={module.id}><header><div><span className={module.pending === 0 ? 'admin-clean-pill success' : module.migrated ? 'admin-clean-pill warning' : 'admin-clean-pill danger'}>{module.pending === 0 ? 'Concluído' : module.migrated ? 'Parcial' : 'Pendente'}</span><h3>{module.title}</h3><p>{module.migrated}/{module.total} no R2 · {module.pending} pendentes · {modulePercent}%</p></div><button type="button" className="admin-clean-button secondary" onClick={() => toggleModule(module)} disabled={!pendingIds.length}>{moduleSelected ? 'Remover módulo' : `Selecionar módulo (${pendingIds.length})`}</button></header><div className="media-lesson-list">{visibleLessons.map((lesson) => <label className={`media-lesson-row ${lesson.status}`} key={lesson.id}><input type="checkbox" checked={selected.has(lesson.id)} disabled={lesson.status !== 'drive'} onChange={() => toggleLesson(lesson)} /><span className={pillClass(lesson.status)}>{statusLabel(lesson.status)}</span><strong>{lesson.title || lesson.slug || 'Aula sem título'}</strong><small>{lesson.status === 'r2' ? 'Já está no Cloudflare R2' : lesson.status === 'drive' ? 'Pronta para migrar do Drive' : 'Sem link de mídia'}</small></label>)}</div></article>; })}{!library.modules.length ? <div className="admin-help-box"><strong>Nenhum módulo encontrado</strong><p className="muted">O produto ainda não retornou módulos vinculados para migração.</p></div> : null}</div>{migrationResults.length > 0 ? <div className="admin-list media-migration-results">{migrationResults.map((item, index) => <div className="admin-row" key={`${item.id}-${index}`}><div><span className={pillClass(item.status)}>{resultLabel(item.status)}</span><h3>{item.title || item.id}</h3><p className="muted">{item.moduleTitle ? `${item.moduleTitle} · ` : ''}{item.step ? `${item.step} · ` : ''}{item.folder || item.mediaUrl || item.reason || item.detail || 'Processado'}</p></div></div>)}</div> : null}</section>;

  return <><section className="card admin-section"><div className="section-heading"><div><p className="eyebrow">Cloudflare R2</p><h2>Upload de mídia</h2><p className="muted">Envie vídeos, áudios e imagens para o bucket configurado nas variáveis do projeto.</p></div></div><div className="admin-form-grid"><label>Arquivo<input type="file" accept="video/*,audio/*,image/*,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>{file ? <div className="admin-preview-card"><span className="pill">{file.type || 'arquivo'}</span><strong>{file.name}</strong><p className="muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div> : null}<button className="button" type="button" onClick={upload} disabled={!file || status === 'signing' || status === 'uploading'}>{status === 'signing' ? 'Preparando...' : status === 'uploading' ? `Enviando ${progress}%` : 'Enviar para R2'}</button></div>{status === 'uploading' ? <div className="progress"><span style={{ width: `${progress}%` }} /></div> : null}{error ? <p className="error-text">{error}</p> : null}{result ? <div className="admin-result-box"><p className="eyebrow">Upload concluído</p><strong>URL pública</strong><code>{result.publicUrl}</code><button className="button secondary" type="button" onClick={() => navigator.clipboard?.writeText(result.publicUrl)}>Copiar URL</button></div> : null}</section>{migrationCard}</>;
}
