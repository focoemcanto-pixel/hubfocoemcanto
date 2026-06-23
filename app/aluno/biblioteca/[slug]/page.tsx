import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function StudentModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: module } = await supabase
    .from('modules')
    .select('id,title,slug,description')
    .eq('slug', slug)
    .single();

  const { data: lessons } = module?.id
    ? await supabase
        .from('exercises')
        .select('id,title,slug,description,sort_order')
        .eq('module_id', module.id)
        .eq('is_active', true)
        .order('sort_order')
    : { data: [] };

  const firstLesson = lessons?.[0];

  if (firstLesson?.slug) {
    redirect(`/aluno/aula/${firstLesson.slug}`);
  }

  return (
    <main className="premium-module-page route-surface">
      <section className="library-hero">
        <p className="eyebrow">Trilha VIP</p>
        <h1>{module?.title || 'Módulo'}</h1>
        <p className="muted">Este módulo ainda não possui aulas publicadas.</p>
        <Link className="button" href="/aluno/biblioteca" prefetch>Voltar para biblioteca</Link>
      </section>
    </main>
  );
}
