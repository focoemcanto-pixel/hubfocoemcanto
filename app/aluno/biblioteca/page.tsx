import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function progressFor(index: number) {
  if (index === 0) return 75;
  if (index === 1) return 40;
  if (index === 2) return 12;
  return 0;
}

function ModuleCard({ module, index }: { module: any; index: number }) {
  const progress = progressFor(index);
  return (
    <Link className="stream-module-card" href={`/aluno/biblioteca/${module.slug}`} prefetch>
      <div className="stream-module-cover">
        {module.cover_url ? <img src={module.cover_url} alt={module.title} /> : null}
        <div className="stream-cover-gradient" />
        <span>{progress ? 'EM ANDAMENTO' : 'MÓDULO'}</span>
        <h2>{module.title}</h2>
      </div>
      <div className="stream-card-meta"><small>{module.exercises?.length || 0} aulas</small><strong>{progress}%</strong></div>
      <div className="stream-progress"><i style={{ width: `${Math.max(8, progress)}%` }} /></div>
    </Link>
  );
}

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
  const activeModules = modules.filter((_: any, index: number) => progressFor(index) > 0);
  const recommended = modules.slice().reverse();

  return (
    <AppShell>
      <main className="stream-library-page netflix-library-page">
        <section className="stream-library-hero netflix-library-hero">
          <p className="eyebrow">Biblioteca VIP</p>
          <h1>Escolha seu treino vocal.</h1>
          <p>Aulas, áudios e duetos organizados como uma plataforma premium: escolha a capa, abra o módulo e continue evoluindo.</p>
        </section>

        <section className="stream-module-shelf">
          <div className="shelf-title-row"><h2>Continue de onde parou</h2><span>{activeModules.length} em andamento</span></div>
          <div className="stream-module-row">{activeModules.map((module: any, index: number) => <ModuleCard module={module} index={index} key={module.id} />)}</div>
        </section>

        <section className="stream-module-shelf">
          <div className="shelf-title-row"><h2>Treinos recomendados</h2><span>arraste para ver</span></div>
          <div className="stream-module-row">{recommended.map((module: any, index: number) => <ModuleCard module={module} index={index + 1} key={module.id} />)}</div>
        </section>

        <section className="stream-module-shelf">
          <div className="shelf-title-row"><h2>Todos os módulos</h2><span>{modules.length} módulos</span></div>
          <div className="stream-module-row">{modules.map((module: any, index: number) => <ModuleCard module={module} index={index} key={module.id} />)}</div>
        </section>
      </main>
    </AppShell>
  );
}
