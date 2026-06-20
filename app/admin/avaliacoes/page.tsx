import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function related(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function AdminReviewsPage() {
  const supabase = createAdminClient();
  const { data: submissions } = await supabase
    .from('submissions')
    .select('id,note,file_url,status,created_at,profiles(name,email),exercises(title)')
    .order('created_at', { ascending: false })
    .limit(80);

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Avaliacoes</p>
          <h1>Fila de atividades</h1>
          <p className="muted">Abra os envios dos alunos e registre as avaliacoes.</p>
        </div>
        <a className="button secondary" href="/admin">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/conteudos">Conteudos</a>
        <a href="/admin/alunos">Alunos</a>
        <a href="/admin/avaliacoes">Avaliacoes</a>
      </nav>

      <section className="card admin-section">
        <h2>Envios recebidos</h2>
        <div className="admin-list">
          {(submissions || []).map((item: any) => {
            const exercise = related(item.exercises);
            const profile = related(item.profiles);
            return (
              <div className="admin-row" key={item.id}>
                <div>
                  <span className="pill">{item.status}</span>
                  <h3>{exercise?.title || 'Atividade'}</h3>
                  <p className="muted">{profile?.name || profile?.email}</p>
                  <p>{item.note}</p>
                </div>
                {item.file_url ? <a className="button secondary" href={item.file_url}>Abrir envio</a> : null}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
