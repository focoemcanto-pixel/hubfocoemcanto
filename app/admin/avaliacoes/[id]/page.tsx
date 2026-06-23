import { BarChart3, CheckCircle2, Clock3, MessageSquare, Music2, RefreshCcw, Sparkles, Star, Trash2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Related = Record<string, any> | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

function ratingField(name: string, label: string, icon: string) {
  return (
    <label className="review-rating-field premium-rating-field">
      <span><i>{icon}</i>{label}</span>
      <select name={name} defaultValue="4">
        <option value="5">5 - excelente</option>
        <option value="4">4 - bom</option>
        <option value="3">3 - atenção</option>
        <option value="2">2 - fraco</option>
        <option value="1">1 - refazer</option>
      </select>
    </label>
  );
}

function timeAgo(value?: string | null) {
  if (!value) return 'agora';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} horas`;
  return new Date(value).toLocaleDateString('pt-BR');
}

export default async function ReviewDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sucesso?: string; erro?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = createAdminClient();
  const { data: submission } = await supabase
    .from('submissions')
    .select('id,note,file_url,file_type,visibility,status,created_at,profiles(name,email,avatar_url),exercises(title,slug,media_url,thumbnail_url,modules(title,slug))')
    .eq('id', id)
    .maybeSingle();

  const { data: reviews } = await supabase.from('reviews').select('*').eq('submission_id', id).order('created_at', { ascending: false });

  const profile = related(submission?.profiles);
  const exercise = related(submission?.exercises);
  const module = related(exercise?.modules);

  return (
    <main className="page admin-shell review-detail-shell premium-review-detail">
      <section className="admin-hero review-hero premium-review-hero">
        <div>
          <p className="eyebrow"><Sparkles size={16} /> Correção individual</p>
          <h1>{exercise?.title || 'Atividade enviada'}</h1>
          <p className="muted">{profile?.name || profile?.email || 'Aluno'} • {module?.title || 'Módulo'} • Enviado {timeAgo(submission?.created_at)}</p>
        </div>
        <div className="premium-review-orb"><Star size={46} fill="currentColor" /></div>
        <a className="button secondary premium-back-button" href="/admin/avaliacoes">Voltar para fila</a>
      </section>

      {query.sucesso ? <div className="notice success">Avaliação salva com sucesso.</div> : null}
      {query.erro ? <div className="notice danger">Erro: {query.erro}</div> : null}

      {!submission ? (
        <section className="card admin-section"><h2>Envio não encontrado</h2></section>
      ) : (
        <>
          <section className="reviews-stat-grid review-detail-stats">
            <article className="reviews-stat"><Clock3 size={28} /><span>Status</span><strong>{submission.status === 'pending_review' ? 'Pendente' : submission.status}</strong><small>Fila atual</small></article>
            <article className="reviews-stat"><CheckCircle2 size={28} /><span>Aluno</span><strong>{profile?.name || 'Aluno'}</strong><small>{profile?.email || 'Sem email'}</small></article>
            <article className="reviews-stat"><RefreshCcw size={28} /><span>Recebido</span><strong>{timeAgo(submission.created_at)}</strong><small>{new Date(submission.created_at).toLocaleString('pt-BR')}</small></article>
            <article className="reviews-stat"><BarChart3 size={28} /><span>Histórico</span><strong>{reviews?.length || 0}</strong><small>Avaliações salvas</small></article>
          </section>

          <section className="review-layout premium-review-grid">
            <article className="card review-video-card premium-video-card">
              <div className="section-heading">
                <div><p className="eyebrow">Envio do aluno</p><h2>Dueto para avaliar</h2></div>
                <span className={`pill status-${submission.status}`}>{submission.status}</span>
              </div>
              {submission.file_url ? <video className="review-video" src={submission.file_url} controls playsInline preload="metadata" /> : <div className="empty-module-player"><p>Nenhum vídeo anexado.</p></div>}
              <div className="review-meta-grid premium-review-meta">
                <div><Music2 size={18} /><span>Aluno</span><strong>{profile?.name || profile?.email}</strong></div>
                <div><Star size={18} /><span>Visibilidade</span><strong>{submission.visibility}</strong></div>
                <div><Clock3 size={18} /><span>Recebido</span><strong>{new Date(submission.created_at).toLocaleString('pt-BR')}</strong></div>
              </div>
              {submission.note ? <p className="review-note">{submission.note}</p> : null}
            </article>

            <aside className="card review-panel premium-review-panel">
              <p className="eyebrow">Avaliar execução</p>
              <h2>Critérios vocais</h2>
              <form action={`/admin/avaliacoes/${submission.id}/salvar`} method="post" className="review-form">
                <div className="review-rating-grid premium-rating-grid">
                  {ratingField('pitch_rating', 'Afinação', '♫')}
                  {ratingField('rhythm_rating', 'Ritmo / entrada', '◴')}
                  {ratingField('harmony_rating', 'Segunda voz', '≈')}
                  {ratingField('confidence_rating', 'Sustentação', '▥')}
                  {ratingField('rating', 'Resultado geral', '★')}
                </div>
                <label className="premium-comment-field"><span><MessageSquare size={16} /> Comentários do professor</span><textarea name="comment" placeholder="Escreva sua observação..." /></label>
                <div className="review-actions premium-review-actions">
                  <button className="button secondary rework-action" type="submit" name="result" value="needs_rework"><RefreshCcw size={18} /> Solicitar refação</button>
                  <button className="button approve-action" type="submit" name="result" value="approved"><CheckCircle2 size={18} /> Aprovar atividade</button>
                </div>
              </form>
              <form action={`/admin/avaliacoes/${submission.id}/excluir`} method="post" className="premium-delete-form">
                <input type="hidden" name="return_to" value="/admin/avaliacoes" />
                <button type="submit"><Trash2 size={18} /> Excluir envio</button>
              </form>
            </aside>
          </section>
        </>
      )}

      {reviews?.length ? (
        <section className="card admin-section premium-history-card">
          <div className="section-heading"><div><p className="eyebrow">Histórico</p><h2>Avaliações anteriores</h2></div></div>
          <div className="admin-list">
            {reviews.map((review: any) => <article className="admin-row" key={review.id}><div><span className="pill">Geral {review.rating || '-'}/5</span><h3>{new Date(review.created_at).toLocaleString('pt-BR')}</h3><p>{review.comment}</p></div></article>)}
          </div>
        </section>
      ) : null}
    </main>
  );
}
