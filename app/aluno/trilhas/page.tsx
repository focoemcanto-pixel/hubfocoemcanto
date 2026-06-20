import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function TracksPage() {
  const supabase = createAdminClient();
  const { data: modules } = await supabase
    .from('modules')
    .select('id,title,slug,description,sort_order')
    .order('sort_order');

  return (
    <AppShell>
      <main className="page">
        <p className="eyebrow">Biblioteca</p>
        <h1 className="hero-title">Trilhas de treino</h1>
        <section className="grid">
          {(modules || []).map((module) => (
            <article className="card" key={module.id}>
              <h2>{module.title}</h2>
              <p className="muted">{module.description}</p>
              <a className="button" href={`/aluno/trilhas/${module.slug}`}>Ver exercícios</a>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
