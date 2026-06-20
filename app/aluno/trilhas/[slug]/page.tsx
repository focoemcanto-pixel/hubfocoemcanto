import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';

export default async function TrackDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: module } = await supabase
    .from('modules')
    .select('id,title,description')
    .eq('slug', slug)
    .single();

  const { data: exercises } = module
    ? await supabase
        .from('exercises')
        .select('id,title,slug,description,media_type,difficulty,sort_order')
        .eq('module_id', module.id)
        .order('sort_order')
    : { data: [] };

  return (
    <AppShell>
      <main className="page">
        <p className="eyebrow">Trilha</p>
        <h1 className="hero-title">{module?.title || 'Trilha'}</h1>
        <p className="muted">{module?.description}</p>
        <section className="grid" style={{ marginTop: 20 }}>
          {(exercises || []).map((exercise) => (
            <article className="card" key={exercise.id}>
              <p className="eyebrow">{exercise.media_type} • nível {exercise.difficulty}</p>
              <h2>{exercise.title}</h2>
              <p className="muted">{exercise.description}</p>
              <a className="button" href={`/aluno/exercicio/${exercise.slug}`}>Praticar</a>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
