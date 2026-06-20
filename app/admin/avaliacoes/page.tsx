import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Related = { title?: string; name?: string; email?: string; modules?: unknown } | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

const filters = [
  { label: 'Pendentes', value: 'pending_review' },
  { label: 'Aprovadas', value: 'approved' },
  { label: 'Refação', value: 'needs_rework' },
  { label: 'Todas', value: 'all' },
];

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const status = params.status || 'pending_review';
  const supabase = createAdminClient();

  let query = supabase
    .from('submissions')
    .select('id,note,file_url,file_type,visibility,status,created_at,profiles(name,email),exercises(title,modules(title))')
    .order('created_at', { ascending: false })
    .limit(120);

  if (status !== 'all') query = query.eq('status', status);

  const [{ data: submissions }, { count: pending }, { count: approved }, { count: rework }] = await Promise.all([
    query,
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'needs_rework'),
  ]);

  return (
    <main className="page admin-shell reviews-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Avaliações</p>
          <h1>Fila de atividades</h1>
          <p className="muted">Corrija duetos, aprove postagens da comunidade e acompanhe a evolução dos alunos.</p>
        </div>
        <a className="button secondary" href="/admin">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/biblioteca">Biblioteca</a>
        <a href="/admin/drive">Drive</a>
        <a href="/admin/alunos">Alunos</a>
        <a href="/admin/avaliacoes">Avaliações</a>
      </nav>

      <section className="admin-grid review-stats">
        <article className="admin-stat"><span>Pendentes</span><strong>{pending || 0}</strong></article>
        <article className="admin-stat"><span>Aprovadas</span><strong>{approved || 0}</strong></article>
        <article className="admin-stat"><span>Refações</span><strong>{rework || 0}</strong></article>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Correção</p>
            <h2>Envios recebidos</h2>
          </div>
          <div className="filter-pills">
            {filters.map((item) => (
              <a className={`pill ${status === item.value ? 'active' : ''}`} href={`/admin/avaliacoes?status=${item.value}`} key={item.value}>{item.label}</a>
            ))}
          </div>
        </div>

        <div className="admin-list review-list">
          {(submissions || []).map((item: any) => {
            const exercise = related(item.exercises);
            const module = related(exercise?.modules);
            const profile = related(item.profiles);
            return (
              <article className="admin-row review-row" key={item.id}>
                <div className="review-thumb-mini">
                  {item.file_url ? <video src={item.file_url} muted preload="metadata" /> : <span>sem vídeo</span>}
                </div>
                <div>
                  <span className={`pill status-${item.status}`}>{item.status}</span>
                  <h3>{exercise?.title || 'Atividade'}</h3>
                  <p className="muted">{profile?.name || profile?.email} • {module?.title || 'Módulo'}</p>
                  <p>{item.note}</p>
                </div>
                <div className="review-row-actions">
                  <small>{new Date(item.created_at).toLocaleString('pt-BR')}</small>
                  <a className="button secondary" href={`/admin/avaliacoes/${item.id}`}>Avaliar</a>
                </div>
              </article>
            );
          })}
          {!submissions?.length ? <p className="muted">Nenhuma atividade encontrada neste filtro.</p> : null}
        </div>
      </section>
    </main>
  );
}
