import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function StudentLibraryPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('modules')
    .select('id,title,slug,description,cover_url,sort_order,exercises(id)')
    .eq('is_active', true)
    .order('sort_order');

  const modules = (data || []).filter((module: any) => {
    const description = String(module.description || '').toLowerCase();
    return !description.startsWith('conteudos importados da pasta') && !description.startsWith('conteúdos importados da pasta');
  });

  return (
    <AppShell>
      <main className="page">
        <section className="library-hero">
          <p className="eyebrow">Biblioteca VIP</p>
          <h1>Escolha sua area de estudo</h1>
          <p className="muted">Aqui aparecem apenas os modulos criados por voce. O Drive serve apenas para anexar aulas dentro de cada modulo.</p>
        </section>

        <section className="library-grid">
          {modules.map((module: any) => (
            <a className="library-card" href={`/aluno/biblioteca/${module.slug}`} key={module.id}>
              <div>
                <span className="content-badge">Modulo</span>
                <h2>{module.title}</h2>
                <p className="muted">{module.description}</p>
              </div>
              <div className="track-footer">
                <small>{module.exercises?.length || 0} conteudos</small>
                <strong>Abrir</strong>
              </div>
            </a>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
