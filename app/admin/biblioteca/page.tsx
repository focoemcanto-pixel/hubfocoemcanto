import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminLibraryPage() {
  const supabase = createAdminClient();
  const [{ data: rawModules }, { count: lessonsCount }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,sort_order,is_active,storage_provider,exercises(id)').neq('is_active', false).order('sort_order'),
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
          <p className="eyebrow">Motor de conteúdo</p>
          <h1>Biblioteca</h1>
          <p className="muted">Aqui vivem os módulos reutilizáveis da escola. Cursos apenas vinculam estes módulos.</p>
        </div>
        <a className="button" href="/admin/biblioteca/novo-modulo">Novo módulo</a>
      </section>

      <nav className="admin-tabs school-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/cursos">Cursos</a>
        <a className="active" href="/admin/biblioteca">Biblioteca</a>
        <a href="/admin/produtos">Produtos</a>
        <a href="/admin/premium">Assinaturas</a>
        <a href="/admin/avaliacoes">Avaliações</a>
      </nav>

      <section className="admin-grid admin-section">
        <article className="admin-stat"><span>Módulos</span><strong>{modules.length}</strong></article>
        <article className="admin-stat"><span>Conteúdos</span><strong>{lessonsCount || 0}</strong></article>
        <article className="admin-stat"><span>Origem</span><strong>Drive / R2</strong><p className="muted">VIP usa Drive agora. Cursos gravados podem usar R2 depois.</p></article>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div><p className="eyebrow">Módulos da biblioteca</p><h2>Áreas de estudo</h2></div>
          <a href="/admin/biblioteca/novo-modulo">Criar módulo</a>
        </div>
        <div className="admin-list">
          {modules.map((module: any, index: number) => (
            <div className="admin-row" key={module.id}>
              <div>
                <span className="pill">Módulo {index + 1} · {module.storage_provider || 'drive'}</span>
                <h3>{module.title}</h3>
                <p className="muted">{module.description || 'Sem descrição'}</p>
              </div>
              <div className="module-action-row">
                <a className="button secondary" href={`/admin/biblioteca/${module.id}`}>Gerenciar</a>
                <a className="button secondary" href={`/aluno/biblioteca/${module.slug}`}>Ver aluno</a>
                <form action={`/admin/biblioteca/${module.id}/excluir`} method="post" onSubmit="return confirm('Remover este módulo da biblioteca?')">
                  <button className="button danger-button" type="submit">Excluir</button>
                </form>
              </div>
            </div>
          ))}
          {modules.length === 0 ? <p className="muted">Crie seu primeiro módulo para começar.</p> : null}
        </div>
      </section>
    </main>
  );
}
