import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Related = Record<string, any> | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

function ratingField(name: string, label: string) {
  return (
    <label className="review-rating-field">
      <span>{label}</span>
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

export default async function ReviewDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sucesso?: string; erro?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = createAdminClient();
  const { data: submission } = await supabase
    .from('submissions')
    .select('id,note,file_url,file_type,visibility,status,created_at,profiles(name,email,avatar_url),exercises(title,slug,media_url,thumbnail_url,modules(title,slug))')
    .eq('id', id)
    .maybeSingle();

  const { data: reviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('submission_id', id)
    .order('created_at', { ascending: false });

  const profile = related(submission?.profiles);
  const exercise = related(submission?.exercises);
  const module = related(exercise?.modules);

  return (
    <main className="page admin-shell review-detail-shell">
      <section className="admin-hero review-hero">
        <div>
          <p className="eyebrow">Correção individual</p>
          <h1>{exercise?.title || 'Atividade enviada'}</h1>
          <p className="muted">{profile?.name || profile?.email || 'Aluno'} • {module?.title || 'Modulo'}</p>
        </div>
        <a className="button secondary" href="/admin/avaliacoes">Voltar para fila</a>
      </section>

      {query.sucesso ? <div className="notice success">Avaliação salva com sucesso.</div> : null}
      {query.erro ? <div className="notice danger">Erro: {query.erro}</div> : null}

      {!submission ? (
        <section className="card admin-section"><h2>Envio não encontrado</h2></section>
      ) : (
        <section className="review-layout">
          <article className="card review-video-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Envio do aluno</p>
                <h2>Dueto para avaliar</h2>
              </div>
              <span className={`pill status-${submission.status}`}>{submission.status}</span>
            </div>
            {submission.file_url ? (
              <video className="review-video" src={submission.file_url} controls preload="metadata" />
            ) : (
              <div className="empty-module-player"><p>Nenhum vídeo anexado.</p></div>
            )}
            <div className="review-meta-grid">
              <div><span>Aluno</span><strong>{profile?.name || profile?.email}</strong></div>
              <div><span>Visibilidade</span><strong>{submission.visibility}</strong></div>
              <div><span>Recebido</span><strong>{new Date(submission.created_at).toLocaleString('pt-BR')}</strong></div>
            </div>
            {submission.note ? <p className="review-note">{submission.note}</p> : null}
          </article>

          <aside className="card review-panel">
            <p className="eyebrow">Avaliar execução</p>
            <h2>Critérios vocais</h2>
            <form action={`/admin/avaliacoes/${submission.id}/salvar`} method="post" className="review-form">
              <div className="review-rating-grid">
                {ratingField('pitch_rating', 'Afinação')}
                {ratingField('rhythm_rating', 'Ritmo / entrada')}
                {ratingField('harmony_rating', 'Segunda voz')}
                {ratingField('confidence_rating', 'Sustentação')}
                {ratingField('rating', 'Resultado geral')}
              </div>
              <label>
                <span>Comentário do professor</span>
                <textarea name="comment" placeholder="Ex: boa entrada, mas ajuste a sustentação no refrão..." />
              </label>
              <div className="review-actions">
                <button className="button secondary" type="submit" name="result" value="needs_rework">Pedir refação</button>
                <button className="button" type="submit" name="result" value="approved">Aprovar</button>
              </div>
            </form>
          </aside>
        </section>
      )}

      {reviews?.length ? (
        <section className="card admin-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Histórico</p>
              <h2>Avaliações anteriores</h2>
            </div>
          </div>
          <div className="admin-list">
            {reviews.map((review: any) => (
              <article className="admin-row" key={review.id}>
                <div>
                  <span className="pill">Geral {review.rating || '-'}/5</span>
                  <h3>{new Date(review.created_at).toLocaleString('pt-BR')}</h3>
                  <p>{review.comment}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
