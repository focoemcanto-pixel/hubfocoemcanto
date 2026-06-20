import { DuetRecorder } from '@/components/duet-recorder';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: lesson } = await supabase
    .from('exercises')
    .select('id,title,slug,description,modules(title,slug)')
    .eq('slug', slug)
    .single();

  const module = Array.isArray(lesson?.modules) ? lesson?.modules[0] : lesson?.modules;

  return (
    <main className="activity-page">
      <header className="activity-topbar">
        <a href={`/aluno/aula/${lesson?.slug || slug}`}>← Voltar para aula</a>
        <strong>{module?.title || 'Atividade VIP'}</strong>
      </header>
      <DuetRecorder lessonTitle={lesson?.title || 'Atividade'} lessonSlug={lesson?.slug || slug} />
    </main>
  );
}
