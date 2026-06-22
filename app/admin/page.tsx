import { createAdminClient } from '@/lib/supabase/admin';

type Related = { title?: string; name?: string; email?: string } | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = createAdminClient();
  const [studentsResult, pendingResult, productsResult, coursesResult, modulesResult, lessonsResult, submissionsResult] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase.from('course_modules').select('*', { count: 'exact', head: true }),
    supabase.from('lessons').select('*', { count: 'exact', head: true }),
    supabase.from('submissions').select('id,note,file_url,status,created_at,profiles(name,email),exercises(title)').eq('status', 'pending_review').order('created_at', { ascending: false }).limit(8),
  ]);

  const submissions = submissionsResult.data || [];

  return (
    <main className="page admin-shell school-admin-shell">
      <section className="admin-hero school-hero">
        <div>
          <p className="eyebrow">Escola Foco em Canto</p>
          <h1>Painel da escola</h1>
          <p className="muted">Controle produtos, cursos, módulos, aulas, assinaturas, comunidade e avaliações em uma experiência premium.</p>
        </div>
        <div className="hero-actions compact-actions">
          <a className="button premium-button" href="/admin/cursos">Gerenciar cursos</a>
          <a className="button secondary premium-button" href="/admin/produtos">Produtos</a>
        </div>
      </section>

      <nav className="admin-tabs school-tabs">
        <a className="active" href="/admin">Resumo</a>
        <a href="/admin/produtos">Produtos</a>
        <a href="/admin/cursos">Cursos</a>
        <a href="/admin/alunos">Alunos</a>
        <a href="/admin/premium">Assinaturas</a>
        <a href="/admin/avaliacoes">Avaliações</a>
      </nav>

      <section className="admin-grid school-stat-grid">
        <article className="admin-stat premium-stat"><span>Produtos</span><strong>{productsResult.count || 0}</strong><small>VIP, cursos e mentorias.</small></article>
        <article className="admin-stat premium-stat"><span>Cursos e salas</span><strong>{coursesResult.count || 0}</strong><small>Experiências por produto.</small></article>
        <article className="admin-stat premium-stat"><span>Módulos</span><strong>{modulesResult.count || 0}</strong><small>Organização dos cursos.</small></article>
        <article className="admin-stat premium-stat"><span>Aulas</span><strong>{lessonsResult.count || 0}</strong><small>Vídeos e atividades.</small></article>
        <article className="admin-stat premium-stat"><span>Alunos</span><strong>{studentsResult.count || 0}</strong><small>Perfis cadastrados.</small></article>
        <article className="admin-stat premium-stat"><span>Pendentes</span><strong>{pendingResult.count || 0}</strong><small>Envios para análise.</small></article>
      </section>

      <section className="admin-kicker-grid school-action-grid">
        <article className="admin-stat school-feature-card featured-card">
          <span>Estrutura</span>
          <strong>Produtos</strong>
          <p className="muted">Cadastre o que será vendido ou liberado: Grupo VIP, Foco em Harmonia, ebooks e futuras mentorias.</p>
          <a className="button secondary premium-button" href="/admin/produtos">Abrir produtos</a>
        </article>
        <article className="admin-stat school-feature-card featured-card gold-card">
          <span>Conteúdo</span>
          <strong>Cursos</strong>
          <p className="muted">Monte cursos como na Kiwify: capa, descrição, módulos, aulas, materiais e atividades.</p>
          <a className="button premium-button" href="/admin/cursos">Criar e editar cursos</a>
        </article>
        <article className="admin-stat school-feature-card featured-card">
          <span>Acesso</span>
          <strong>Assinaturas</strong>
          <p className="muted">Continue usando Kiwify agora e prepare a escola para checkout próprio depois.</p>
          <a className="button secondary premium-button" href="/admin/premium">Gerenciar acessos</a>
        </article>
      </section>

      <section className="card admin-section premium-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Fila do professor</p>
            <h2>Avaliações pendentes</h2>
          </div>
          <a className="button secondary premium-button" href="/admin/avaliacoes">Ver todas</a>
        </div>
        <div className="admin-list">
          {submissions.length ? submissions.map((item) => {
            const exercise = related(item.exercises);
            const profile = related(item.profiles);
            return (
              <div className="admin-row premium-row" key={item.id}>
                <div>
                  <span className="pill">{item.status}</span>
                  <h3>{exercise?.title || 'Atividade'}</h3>
                  <p className="muted">{profile?.name || profile?.email}</p>
                  <p>{item.note}</p>
                </div>
                {item.file_url ? <a className="button secondary premium-button" href={item.file_url}>Abrir envio</a> : null}
              </div>
            );
          }) : (
            <div className="empty-premium-state">
              <strong>Nenhuma avaliação pendente.</strong>
              <p className="muted">Quando alunos enviarem atividades do VIP, elas aparecerão aqui.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
