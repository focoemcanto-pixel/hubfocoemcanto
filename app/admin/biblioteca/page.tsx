import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminLibraryPage() {
  const supabase = createAdminClient();
  const [{ data: modules }, { count: lessonsCount }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,sort_order,exercises(id)').order('sort_order'),
    supabase.from('exercises').select('*', { count: 'exact', head: true }),
  ]);

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Biblioteca VIP</p>
          <h1>Organize a plataforma</h1>
          <p className="muted">O Drive guarda os arquivos. O Hub organiza modulos, aulas e exercicios para o aluno assistir aqui dentro.</p>
        </div>
        <a className="button" href="/admin/biblioteca/novo-modulo">Novo modulo</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/biblioteca">Biblioteca</a>
        <a href="/admin/drive">Importar Drive</a>
        <a href="/admin/avaliacoes">Avaliacoes</a>
      </nav>

      <section className="admin-grid admin-section">
        <article className="admin-stat">
          <span>Modulos</span>
          <strong>{modules?.length || 0}</strong>
        </article>
        <article className="admin-stat">
          <span>Aulas e exercicios</span>
          <strong>{lessonsCount || 0}</strong>
        </article>
        <article className="admin-stat">
          <span>Fonte</span>
          <strong>Drive</strong>
          <p className="muted">Importe arquivos e edite os titulos dentro do Hub.</p>
        </article>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Modulos</p>
            <h2>Areas de estudo</h2>
          </div>
          <a href="/admin/drive">Importar do Drive</a>
        </div>
        <div className="admin-list">
          {(modules || []).map((module: any, index: number) => (
            <div className="admin-row" key={module.id}>
              <div>
                <span className="pill">Modulo {index + 1}</span>
                <h3>{module.title}</h3>
                <p className="muted">{module.description || 'Sem descricao'}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="button secondary" href={`/admin/biblioteca/${module.id}`}>Gerenciar</a>
                <a className="button secondary" href={`/aluno/biblioteca/${module.slug}`}>Ver aluno</a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
