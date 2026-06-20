import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function StudentModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: module } = await supabase.from('modules').select('id,title,slug,description').eq('slug', slug).single();
  const { data: exercises } = module
    ? await supabase.from('exercises').select('id,title,slug,description,media_type,difficulty,sort_order').eq('module_id', module.id).eq('is_active', true).order('sort_order')
    : { data: [] };

  return (
    <AppShell>
      <main className="page">
        <section className="library-hero">
          <p className="eyebrow">Modulo</p>
          <h1>{module?.title || 'Biblioteca'}</h1>
          <p className="muted">{module?.description}</p>
          <div className="library-actions">
            <a className="button secondary" href="/aluno/biblioteca">Voltar</a>
            <a className="button" href="/aluno/enviar">Enviar atividade</a>
          </div>
        </section>

        <section className="content-list">
          {(exercises || []).map((exercise) => (
            <a className="content-row" href={`/aluno/aula/${exercise.slug}`} key={exercise.id}>
              <div className="content-icon">{exercise.media_type || 'video'}</div>
              <div>
                <span className="content-badge">Nivel {exercise.difficulty}</span>
                <h3>{exercise.title}</h3>
                <p className="muted">{exercise.description || 'Assista, pratique e envie sua resposta para avaliacao.'}</p>
              </div>
              <strong>Abrir</strong>
            </a>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
