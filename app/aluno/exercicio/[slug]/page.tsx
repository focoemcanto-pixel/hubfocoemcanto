import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';

export default async function ExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: exercise } = await supabase
    .from('exercises')
    .select('id,title,description,objective,media_type,difficulty,media_url,audio_url,drive_url')
    .eq('slug', slug)
    .single();

  return (
    <AppShell>
      <main className="page">
        <section className="card">
          <p className="eyebrow">Exercício • nível {exercise?.difficulty || 1}</p>
          <h1 className="hero-title">{exercise?.title || 'Exercício'}</h1>
          <p className="muted">{exercise?.description}</p>
          <div className="card" style={{ marginTop: 18 }}>
            <h2>Objetivo do treino</h2>
            <p className="muted">{exercise?.objective || 'Pratique com atenção e envie sua execução para avaliação.'}</p>
          </div>
          <div className="split" style={{ marginTop: 18 }}>
            {exercise?.drive_url ? <a className="button secondary" href={exercise.drive_url}>Abrir material</a> : null}
            <a className="button" href={`/aluno/enviar?exercise=${exercise?.id || ''}`}>Enviar atividade</a>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
