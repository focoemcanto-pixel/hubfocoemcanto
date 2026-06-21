import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function StudentModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: module } = await supabase.from('modules').select('id,title,slug,description').eq('slug', slug).single();
  const { data: lessons } = module?.id
    ? await supabase.from('exercises').select('id,title,slug,description,sort_order').eq('module_id', module.id).eq('is_active', true).order('sort_order')
    : { data: [] };

  const firstLesson = lessons?.[0];

  return (
    <main className="premium-module-page route-surface">
      <section className="library-hero">
        <p className="eyebrow">Trilha VIP</p>
        <h1>{module?.title || 'Modulo'}</h1>
        <p className="muted">{module?.description || 'Escolha uma aula para iniciar a jornada.'}</p>
        {firstLesson ? <Link className="button" href={`/aluno/aula/${firstLesson.slug}`} prefetch>Começar primeira aula</Link> : <Link className="button" href="/aluno/biblioteca" prefetch>Voltar para biblioteca</Link>}
      </section>

      <section className="premium-module-list-shell">
        {(lessons || []).map((item: any, index: number) => (
          <article className="premium-module-list-row" key={item.id}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.description || 'Aula prática do modulo.'}</p>
            </div>
            <Link href={`/aluno/aula/${item.slug}`} prefetch>Abrir aula</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
