'use client';

import { useMemo, useState } from 'react';
import { DownloadCloud, Loader2, Link2, Search, Trash2 } from 'lucide-react';

type Props = {
  productId: string;
  moduleId: string;
  moduleTitle: string;
  missingInitial?: number;
};

type MissingLesson = { id: string; title: string; slug?: string | null; reason?: string | null; streamUid?: string | null };
type StreamVideo = { uid: string; name: string; status: string; duration?: number | null; thumbnail?: string | null };
type MapResult = {
  totalLessons?: number;
  linkedLessons?: number;
  missingCount?: number;
  availableCount?: number;
  missingLessons?: MissingLesson[];
  availableVideos?: StreamVideo[];
  message?: string;
  error?: string;
};

function cleanTitle(name: string) {
  return name.replace(/\.[^/.]+$/, '').trim();
}

function time(seconds?: number | null) {
  if (!seconds) return '';
  const total = Math.round(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function AdminContentStreamTools({ productId, moduleId, moduleTitle, missingInitial = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState('');
  const [importing, setImporting] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<MapResult | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});

  const missingLessons = result?.missingLessons || [];
  const availableVideos = result?.availableVideos || [];
  const selectedDeleteIds = useMemo(() => missingLessons.map((lesson) => lesson.id), [missingLessons]);

  async function map() {
    setOpen(true);
    setLoading(true);
    setMessage('Mapeando aulas sem Stream e vídeos disponíveis...');
    try {
      const response = await fetch('/api/admin/media/content-stream-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, moduleId }),
      });
      const json: MapResult = await response.json().catch(() => ({}));
      if (!response.ok || json.error) throw new Error(json.message || json.error || 'Não foi possível mapear este módulo.');
      setResult(json);
      setMessage(`${json.missingCount || 0} aulas sem Stream válido · ${json.availableCount || 0} vídeos livres no Cloudflare para importar.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao mapear módulo.');
    }
    setLoading(false);
  }

  async function attach(lessonId: string) {
    const uid = selected[lessonId];
    if (!uid) return;
    setLinking(lessonId);
    setMessage('Atrelando vídeo à aula...');
    try {
      const response = await fetch('/api/admin/media/stream-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, moduleId, manualLinks: [{ uid, exerciseId: lessonId }] }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.error) throw new Error(json.message || json.error || 'Não foi possível atrelar o vídeo.');
      setSelected((current) => ({ ...current, [lessonId]: '' }));
      await map();
      setMessage('Vídeo atrelado com sucesso. Atualize a página para ver o selo Stream na lista.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao atrelar vídeo.');
    }
    setLinking('');
  }

  async function importVideo(video: StreamVideo) {
    setImporting(video.uid);
    setMessage(`Importando ${video.name} para este módulo...`);
    try {
      const response = await fetch('/api/admin/media/stream-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, moduleId, title: video.name, uid: video.uid, relativePath: video.name, createMissing: true }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.error) throw new Error(json.message || json.error || 'Não foi possível importar este vídeo.');
      await map();
      setMessage(json.createdExercise ? 'Aula criada a partir do vídeo do Stream.' : 'Vídeo vinculado a uma aula existente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao importar vídeo.');
    }
    setImporting('');
  }

  async function importAllAvailable() {
    if (!availableVideos.length) return;
    const ok = window.confirm(`Importar ${availableVideos.length} vídeos livres do Stream para o módulo ${moduleTitle}?`);
    if (!ok) return;
    setBulkImporting(true);
    let imported = 0;
    let failed = 0;
    for (const video of availableVideos) {
      setMessage(`Importando ${imported + 1}/${availableVideos.length}: ${video.name}`);
      try {
        const response = await fetch('/api/admin/media/stream-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, moduleId, title: video.name, uid: video.uid, relativePath: video.name, createMissing: true }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || json.error) throw new Error(json.message || json.error || 'Falhou.');
        imported += 1;
      } catch {
        failed += 1;
      }
    }
    await map();
    setMessage(`${imported} vídeos importados do Stream${failed ? ` · ${failed} falharam` : ''}. Atualize a página para ver a lista.`);
    setBulkImporting(false);
  }

  async function deleteMissing() {
    if (!missingLessons.length) return;
    const ok = window.confirm(`Excluir ${missingLessons.length} aulas deste módulo que ainda não possuem Stream válido?`);
    if (!ok) return;
    setDeleting(true);
    setMessage('Excluindo aulas sem Stream válido...');
    try {
      const response = await fetch('/api/admin/media/content-stream-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, moduleId, deleteLessonIds: selectedDeleteIds }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.error) throw new Error(json.message || json.error || 'Não foi possível excluir.');
      await map();
      setMessage(`${json.deleted || 0} aulas sem Stream válido excluídas. Atualize a página para limpar a lista.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao excluir aulas.');
    }
    setDeleting(false);
  }

  return (
    <div className="content-stream-tools">
      <button className="admin-clean-button secondary" type="button" onClick={open ? () => setOpen(false) : map} title="Mapear e importar vídeos do Stream neste módulo">
        {loading ? <><Loader2 size={14} className="premium-video-spinner" /> Mapeando</> : <><Search size={14} /> Stream</>}
      </button>
      {missingInitial > 0 ? <span className="admin-clean-pill warning">{missingInitial} sem Stream</span> : null}

      {open ? (
        <div className="admin-help-box content-stream-panel">
          <div className="section-heading">
            <div>
              <strong>Stream · {moduleTitle}</strong>
              <p className="muted">Importe vídeos já enviados ao Cloudflare, atrele a aulas existentes ou exclua aulas sem Stream válido.</p>
            </div>
            <button className="admin-clean-button secondary" type="button" onClick={map} disabled={loading}>{loading ? 'Lendo...' : 'Atualizar'}</button>
          </div>
          {message ? <p className="muted">{message}</p> : null}
          {result ? (
            <>
              <div className="admin-grid admin-section">
                <article className="admin-stat"><span>Aulas</span><strong>{result.totalLessons || 0}</strong><p className="muted">Neste módulo.</p></article>
                <article className="admin-stat"><span>Com Stream</span><strong>{result.linkedLessons || 0}</strong><p className="muted">Validadas no Cloudflare.</p></article>
                <article className="admin-stat"><span>Sem válido</span><strong>{result.missingCount || 0}</strong><p className="muted">Atrelar ou excluir.</p></article>
                <article className="admin-stat"><span>Vídeos livres</span><strong>{result.availableCount || 0}</strong><p className="muted">Prontos para importar.</p></article>
              </div>

              {availableVideos.length ? (
                <div className="admin-help-box">
                  <div className="section-heading">
                    <div>
                      <strong>Importar vídeos do Stream para este módulo</strong>
                      <p className="muted">Cria uma aula nova com o nome do vídeo ou vincula se encontrar uma aula com nome parecido.</p>
                    </div>
                    <button className="admin-clean-button primary" type="button" disabled={bulkImporting} onClick={importAllAvailable}>
                      {bulkImporting ? <><Loader2 size={14} className="premium-video-spinner" /> Importando</> : <><DownloadCloud size={14} /> Importar todos</>}
                    </button>
                  </div>
                  <div className="admin-list media-migration-results">
                    {availableVideos.slice(0, 120).map((video) => (
                      <div className="admin-row" key={video.uid}>
                        <div>
                          <span className="admin-clean-pill success">Livre no Stream</span>
                          <h3>{cleanTitle(video.name)}</h3>
                          <p className="muted">{video.name}{video.duration ? ` · ${time(video.duration)}` : ''} · UID {video.uid}</p>
                        </div>
                        <button className="admin-clean-button secondary" type="button" disabled={importing === video.uid || bulkImporting} onClick={() => importVideo(video)}>
                          {importing === video.uid ? <><Loader2 size={14} className="premium-video-spinner" /> Importando</> : <><DownloadCloud size={14} /> Importar aula</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="admin-clean-muted">Nenhum vídeo livre no Cloudflare para importar neste momento.</p>}

              {missingLessons.length ? (
                <div className="admin-list media-migration-results">
                  {missingLessons.slice(0, 80).map((lesson) => (
                    <div className="admin-row" key={lesson.id}>
                      <div>
                        <span className="admin-clean-pill warning">Sem Stream válido</span>
                        <h3>{lesson.title}</h3>
                        {lesson.reason ? <p className="muted">{lesson.reason}</p> : null}
                        <label>Atrelar vídeo
                          <select value={selected[lesson.id] || ''} onChange={(event) => setSelected((current) => ({ ...current, [lesson.id]: event.target.value }))}>
                            <option value="">Escolha um vídeo do Stream</option>
                            {availableVideos.map((video) => <option key={video.uid} value={video.uid}>{video.name}{video.duration ? ` · ${time(video.duration)}` : ''}</option>)}
                          </select>
                        </label>
                      </div>
                      <button className="admin-clean-button secondary" type="button" disabled={!selected[lesson.id] || linking === lesson.id} onClick={() => attach(lesson.id)}>
                        {linking === lesson.id ? <><Loader2 size={14} className="premium-video-spinner" /> Atrelando</> : <><Link2 size={14} /> Atrelar</>}
                      </button>
                    </div>
                  ))}
                </div>
              ) : <p className="admin-clean-muted">Todas as aulas deste módulo já possuem Stream válido.</p>}
              {missingLessons.length ? <button className="admin-clean-button danger" type="button" disabled={deleting} onClick={deleteMissing}>{deleting ? <><Loader2 size={14} className="premium-video-spinner" /> Excluindo</> : <><Trash2 size={14} /> Excluir aulas sem Stream válido</>}</button> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
