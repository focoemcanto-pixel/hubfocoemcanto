import { createAdminClient } from '@/lib/supabase/admin';

type Related = { title?: string; name?: string; email?: string } | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = createAdminClient();
  const [{ count: students }, { count: pending }, { count: modules }, { count: exercises }, { data: submissions }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('modules').select('*', { count: 'exact', head: true }),
    supabase.from('exercises').select('*', { count: 'exact', head: true }),
    supabase.from('submissions').select('id,note,file_url,status,created_at,profiles(name,email),exercises(title)').eq('status', 'pending_review').order('created_at', { ascending: false }).limit(8),
  ]);

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Admin Hub</p>
          <h1>Painel do professor</h1>
          <p className="muted">Gerencie biblioteca, alunos, assinaturas, comunidade e avaliacoes.</p>
        </div>
        <a className="button" href="/admin/premium">Abrir Premium</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/biblioteca">Biblioteca</a>
        <a href="/admin/drive">Drive</a>
        <a href="/admin/premium">Premium</a>
        <a href="/admin/alunos">Alunos</a>
        <a href="/admin/avaliacoes">Avaliacoes</a>
      </nav>

      <section className="admin-grid">
        <article className="admin-stat"><span>Alunos</span><strong>{students || 0}</strong></article>
        <article className="admin-stat"><span>Pendentes</span><strong>{pending || 0}</strong></article>
        <article className="admin-stat"><span>Modulos</span><strong>{modules || 0}</strong></article>
        <article className="admin-stat"><span>Aulas e exercicios</span><strong>{exercises || 0}</strong></article>
      </section>

      <section className="admin-kicker-grid">
        <article className="admin-stat">
          <span>Premium</span>
          <strong>Kiwify</strong>
          <p className="muted">Gerencie assinantes ativos, atrasados e removidos.</p>
          <a className="button secondary" href="/admin/premium">Gerenciar premium</a>
        </article>
        <article className="admin-stat">
          <span>Conteudo</span>
          <strong>Biblioteca VIP</strong>
          <p className="muted">Organize modulos, aulas, audios e exercicios do jeito que o aluno vai consumir.</p>
          <a className="button secondary" href="/admin/biblioteca">Gerenciar biblioteca</a>
        </article>
        <article className="admin-stat">
          <span>Fonte</span>
          <strong>Google Drive</strong>
          <p className="muted">Use o Drive como origem dos arquivos, mas mantenha a experiencia premium dentro do Hub.</p>
          <a className="button secondary" href="/admin/drive">Importar do Drive</a>
        </article>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Fila</p>
            <h2>Avaliacoes pendentes</h2>
          </div>
          <a href="/admin/avaliacoes">Ver todas</a>
        </div>
        <div className="admin-list">
          {(submissions || []).map((item) => {
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
