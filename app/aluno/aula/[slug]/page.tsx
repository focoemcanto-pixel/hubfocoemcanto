import { AppShell } from '@/components/app-shell';
import { ContentPlayer } from '@/components/content-player';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function StudentLessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: lesson } = await supabase
    .from('exercises')
    .select('id,title,slug,description,objective,media_type,difficulty,drive_url,media_url,audio_url,modules(title,slug)')
    .eq('slug', slug)
    .single();
  const module = Array.isArray(lesson?.modules) ? lesson?.modules[0] : lesson?.modules;

  return (
    <AppShell>
      <main className="page">
        <section className="library-hero">
          <p className="eyebrow">{module?.title || 'Aula'}</p>
          <h1>{lesson?.title || 'Aula'}</h1>
          <p className="muted">{lesson?.description}</p>
          <div className="library-actions">
            <a className="button secondary" href={module?.slug ? `/aluno/biblioteca/${module.slug}` : '/aluno/biblioteca'}>Voltar ao modulo</a>
            <a className="button" href={`/aluno/enviar?exercise=${lesson?.id || ''}`}>Enviar minha resposta</a>
          </div>
        </section>

        <section className="lesson-layout admin-section">
          <ContentPlayer title={lesson?.title || 'Conteudo'} mediaType={lesson?.media_type} mediaUrl={lesson?.media_url || lesson?.audio_url} driveUrl={lesson?.drive_url} />
          <aside className="lesson-sidebar">
            <article className="card">
              <p className="eyebrow">Objetivo</p>
              <h2>O que praticar</h2>
              <p className="muted">{lesson?.objective || 'Assista ao material, pratique sua parte e envie sua execucao para avaliacao.'}</p>
            </article>
            <article className="card">
              <p className="eyebrow">Nivel</p>
              <h2>{lesson?.difficulty || 1}</h2>
              <p className="muted">Repita quantas vezes precisar antes de enviar.</p>
            </article>
          </aside>
        </section>
      </main>
    </AppShell>
  );
}
