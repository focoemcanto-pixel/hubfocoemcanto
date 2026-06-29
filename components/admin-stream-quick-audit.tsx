'use client';

import { useState } from 'react';
import { Loader2, Link2, Trash2, Wand2 } from 'lucide-react';

type ModuleOption = { id: string; title: string; slug?: string | null };
type Props = { productId: string; modules?: ModuleOption[] };
type MissingLesson = { id: string; title: string; moduleId?: string | null; suggestedVideo?: { uid: string; name: string; score: number } | null };
type OrphanVideo = { uid: string; name: string; status: string; duration?: number | null; thumbnail?: string | null };
type AuditResult = { totalVideos?: number; totalLessons?: number; linkedCount?: number; missingLessons?: MissingLesson[]; orphanVideos?: OrphanVideo[]; message?: string; error?: string };

function durationLabel(seconds?: number | null) {
  const value = Math.round(Number(seconds || 0));
  if (!value) return 'sem duração';
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

export function AdminStreamQuickAudit({ productId, modules = [] }: Props) {
  const [moduleId, setModuleId] = useState(modules[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  async function request(action: 'audit' | 'link' | 'delete' = 'audit', extra: Record<string, string> = {}) {
    setLoading(true);
    setMessage(action === 'audit' ? 'Lendo aulas e vídeos do Stream...' : 'Aplicando alteração...');
    try {
      const response = await fetch('/api/admin/media/stream-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, moduleId, action, ...extra }),
      });
      const json: AuditResult = await response.json().catch(() => ({}));
      if (!response.ok || json.error) throw new Error(json.message || json.error || 'Não foi possível auditar o Stream.');
      setResult(json);
      setMessage(`${json.missingLessons?.length || 0} aulas sem Stream · ${json.orphanVideos?.length || 0} vídeos sem atrelamento.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao auditar Stream.');
    }
    setLoading(false);
  }

  async function link(uid: string, lessonId: string) {
    if (!uid || !lessonId) return;
    await request('link', { uid, exerciseId: lessonId });
  }

  async function remove(uid: string) {
    if (!uid) return;
    const ok = window.confirm('Excluir este vídeo órfão do Cloudflare Stream? Esta ação libera minutos e não pode ser desfeita pelo Hub.');
    if (!ok) return;
    await request('delete', { uid });
  }

  return (
    <section className="admin-stream-quick-audit">
      <div className="media-migration-toolbar">
        <select value={moduleId} onChange={(event) => { setModuleId(event.target.value); setResult(null); setMessage(''); }} aria-label="Módulo para mapear Stream">
          <option value="">Todos os módulos</option>
          {modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
        </select>
        <button className="admin-clean-button secondary" type="button" disabled={loading} onClick={() => request('audit')}>
          {loading ? <><Loader2 size={14} className="premium-video-spinner" /> Mapeando...</> : <><Wand2 size={14} /> Mapear Stream</>}
        </button>
      </div>

      {message ? <p className="admin-clean-muted">{message}</p> : null}

      {result ? (
        <div className="admin-help-box stream-audit-box">
          <strong>Leitura do Stream</strong>
          <p className="admin-clean-muted">{result.totalVideos || 0} vídeos no Stream · {result.totalLessons || 0} aulas lidas · {result.linkedCount || 0} vínculos encontrados.</p>

          <div className="admin-grid admin-section">
            <article className="admin-stat"><span>Aulas sem Stream</span><strong>{result.missingLessons?.length || 0}</strong><p className="muted">Escolha um vídeo para atrelar.</p></article>
            <article className="admin-stat"><span>Vídeos órfãos</span><strong>{result.orphanVideos?.length || 0}</strong><p className="muted">Podem ser excluídos do Stream.</p></article>
          </div>

          {result.missingLessons?.length ? (
            <div className="admin-list media-migration-results">
              <h3>Aulas sem vídeo Stream</h3>
              {result.missingLessons.slice(0, 80).map((lesson) => {
                const selectedUid = links[lesson.id] || lesson.suggestedVideo?.uid || '';
                return (
                  <div className="admin-row" key={lesson.id}>
                    <div>
                      <span className="admin-clean-pill warning">Sem Stream</span>
                      <h3>{lesson.title}</h3>
                      <p className="muted">{lesson.suggestedVideo ? `Sugestão: ${lesson.suggestedVideo.name} · score ${lesson.suggestedVideo.score}` : 'Nenhuma sugestão automática forte.'}</p>
                      <select value={selectedUid} onChange={(event) => setLinks((current) => ({ ...current, [lesson.id]: event.target.value }))}>
                        <option value="">Escolha um vídeo do Stream sem atrelamento</option>
                        {(result.orphanVideos || []).map((video) => <option key={video.uid} value={video.uid}>{video.name} · {durationLabel(video.duration)}</option>)}
                      </select>
                    </div>
                    <button className="admin-clean-button secondary" type="button" disabled={loading || !selectedUid} onClick={() => link(selectedUid, lesson.id)}><Link2 size={14} /> Atrelar</button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {result.orphanVideos?.length ? (
            <div className="admin-list media-migration-results">
              <h3>Vídeos no Stream sem atrelamento</h3>
              {result.orphanVideos.slice(0, 120).map((video) => (
                <div className="admin-row" key={video.uid}>
                  <div>
                    <span className="admin-clean-pill danger">Órfão</span>
                    <h3>{video.name}</h3>
                    <p className="muted">UID {video.uid} · {video.status} · {durationLabel(video.duration)}</p>
                  </div>
                  <button className="admin-clean-button danger" type="button" disabled={loading} onClick={() => remove(video.uid)}><Trash2 size={14} /> Excluir do Stream</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
