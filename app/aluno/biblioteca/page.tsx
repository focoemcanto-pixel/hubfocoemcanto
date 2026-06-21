import Link from 'next/link';
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
      <main className="stream-library-page">
        <section className="stream-library-hero">
          <p className="eyebrow">Biblioteca VIP</p>
          <h1>Escolha sua área de estudo.</h1>
          <p>Aulas, áudios e duetos organizados em uma experiência premium de treino vocal.</p>
        </section>
        <section className="stream-module-shelf">
          <div className="shelf-title-row"><h2>Continue evoluindo</h2><span>{modules.length} módulos</span></div>
          <div className="stream-module-row">
            {modules.map((module: any, index: number) => (
              <Link className="stream-module-card" href={`/aluno/biblioteca/${module.slug}`} prefetch key={module.id}>
                <div className="stream-module-cover">
                  {module.cover_url ? <img src={module.cover_url} alt={module.title} /> : null}
                  <div className="stream-cover-gradient" />
                  <span>{index === 0 ? 'EM ANDAMENTO' : 'MÓDULO'}</span>
                  <h2>{module.title}</h2>
                </div>
                <div className="stream-card-meta"><small>{module.exercises?.length || 0} aulas</small><strong>{index === 0 ? '75%' : index === 1 ? '40%' : '0%'}</strong></div>
                <div className="stream-progress"><i /></div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
