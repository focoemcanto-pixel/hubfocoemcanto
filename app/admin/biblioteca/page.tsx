import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminLibraryPage() {
  const supabase = createAdminClient();
  const [{ data: rawModules }, { count: lessonsCount }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,sort_order,exercises(id)').order('sort_order'),
    supabase.from('exercises').select('*', { count: 'exact', head: true }),
  ]);

  const modules = (rawModules || []).filter((module: any) => {
    const description = String(module.description || '').toLowerCase();
    return description.indexOf('importados da pasta') === -1;
  });

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Biblioteca VIP</p>
          <h1>Organize a plataforma</h1>
          <p className="muted">Crie os modulos primeiro. Depois, dentro de cada modulo, selecione a pasta ou arquivo do Drive.</p>
        </div>
        <a className="button" href="/admin/biblioteca/novo-modulo">Novo modulo</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/biblioteca">Biblioteca</a>
        <a href="/admin/premium">Premium</a>
        <a href="/admin/drive">Drive</a>
        <a href="/admin/avaliacoes">Avaliacoes</a>
      </nav>

      <section className="admin-grid admin-section">
        <article className="admin-stat"><span>Modulos</span><strong>{modules.length}</strong></article>
        <article className="admin-stat"><span>Aulas</span><strong>{lessonsCount || 0}</strong></article>
        <article className="admin-stat"><span>Fluxo</span><strong>Modulo primeiro</strong><p className="muted">O Drive entra apenas como fonte da aula.</p></article>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div><p className="eyebrow">Modulos</p><h2>Areas de estudo</h2></div>
          <a href="/admin/biblioteca/novo-modulo">Criar modulo</a>
        </div>
        <div className="admin-list">
          {modules.map((module: any, index: number) => (
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
          {modules.length === 0 ? <p className="muted">Crie seu primeiro modulo para comecar.</p> : null}
        </div>
      </section>
    </main>
  );
}
