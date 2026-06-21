import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Related = { title?: string; name?: string; email?: string; modules?: unknown } | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

function statusLabel(value?: string | null) {
  if (value === 'approved') return 'Aprovada';
  if (value === 'needs_rework') return 'Refação';
  if (value === 'reviewed') return 'Avaliada';
  return 'Pendente';
}

const filters = [
  { label: 'Pendentes', value: 'pending_review' },
  { label: 'Aprovadas', value: 'approved' },
  { label: 'Refação', value: 'needs_rework' },
  { label: 'Todas', value: 'all' },
];

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string; sucesso?: string; erro?: string }> }) {
  const params = await searchParams;
  const status = params.status || 'pending_review';
  const supabase = createAdminClient();

  let query = supabase
    .from('submissions')
    .select('id,note,file_url,file_type,visibility,status,created_at,profiles(name,email,avatar_url),exercises(title,modules(title))')
    .order('created_at', { ascending: false })
    .limit(120);

  if (status !== 'all') query = query.eq('status', status);

  const [{ data: submissions }, { count: pending }, { count: approved }, { count: rework }, { count: total }] = await Promise.all([
    query,
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'needs_rework'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }),
  ]);

  const demo = (submissions || [])[0] as any;
  const demoExercise = related(demo?.exercises);

  return (
    <main className="reviews-premium-shell">
      <section className="reviews-premium-hero">
        <div>
          <p className="eyebrow">Avaliações</p>
          <h1>Fila premium de atividades.</h1>
          <p>Corrija duetos, acompanhe a evolução dos alunos e remova envios duplicados ou incorretos com segurança.</p>
        </div>

        <article className="reviews-demo-card">
          {demo?.file_url ? <video src={demo.file_url} muted playsInline preload="metadata" /> : <div className="reviews-thumb"><span>prévia</span></div>}
          <h3>{demoExercise?.title || 'Card demonstrativo'}</h3>
          <p className="muted">Visual de avaliação com vídeo, aluno, status e ações rápidas.</p>
          <div className="reviews-demo-actions"><span>Avaliar</span><span>Excluir</span></div>
        </article>
      </section>

      {params.sucesso ? <div className="notice success" style={{ marginTop: 16 }}>Ação concluída com sucesso.</div> : null}
      {params.erro ? <div className="notice danger" style={{ marginTop: 16 }}>Erro: {params.erro}</div> : null}

      <nav className="reviews-premium-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/biblioteca">Biblioteca</a>
        <a href="/admin/drive">Drive</a>
        <a href="/admin/alunos">Alunos</a>
        <a className="active" href="/admin/avaliacoes">Avaliações</a>
      </nav>

      <section className="reviews-stat-grid">
        <article className="reviews-stat"><span>Pendentes</span><strong>{pending || 0}</strong></article>
        <article className="reviews-stat"><span>Aprovadas</span><strong>{approved || 0}</strong></article>
        <article className="reviews-stat"><span>Refações</span><strong>{rework || 0}</strong></article>
        <article className="reviews-stat"><span>Total</span><strong>{total || 0}</strong></article>
      </section>

      <section className="reviews-board">
        <div className="reviews-board-head">
          <div>
            <p className="eyebrow">Correção</p>
            <h2>Envios recebidos</h2>
            <p className="muted">Use a fila para avaliar, aprovar, pedir refação ou excluir envios incorretos.</p>
          </div>
          <div className="reviews-filter-pills">
            {filters.map((item) => (
              <a className={status === item.value ? 'active' : ''} href={`/admin/avaliacoes?status=${item.value}`} key={item.value}>{item.label}</a>
            ))}
          </div>
        </div>

        <div className="reviews-queue">
          {(submissions || []).map((item: any) => {
            const exercise = related(item.exercises);
            const module = related(exercise?.modules);
            const profile = related(item.profiles);
            return (
              <article className="reviews-submission-card" key={item.id}>
                <div className="reviews-thumb">
                  {item.file_url ? <video src={item.file_url} muted playsInline preload="metadata" /> : <span>sem vídeo</span>}
                </div>
                <div className="reviews-card-main">
                  <span className="reviews-status-pill">{statusLabel(item.status)}</span>
                  <h3>{exercise?.title || 'Atividade enviada'}</h3>
                  <p>{profile?.name || profile?.email || 'Aluno'} • {module?.title || 'Módulo'}</p>
                  <p className="note">{item.note || 'Envio sem observação do aluno.'}</p>
                </div>
                <div className="reviews-row-actions">
                  <small>{new Date(item.created_at).toLocaleString('pt-BR')}</small>
                  <a href={`/admin/avaliacoes/${item.id}`}>Avaliar</a>
                  <form action={`/admin/avaliacoes/${item.id}/excluir`} method="post">
                    <input type="hidden" name="return_to" value={`/admin/avaliacoes?status=${status}`} />
                    <button className="delete" type="submit">Excluir envio</button>
                  </form>
                </div>
              </article>
            );
          })}
          {!submissions?.length ? <div className="reviews-empty"><h3>Nenhuma atividade encontrada</h3><p className="muted">Quando novos duetos forem enviados, eles aparecerão aqui.</p></div> : null}
        </div>
      </section>
    </main>
  );
}
