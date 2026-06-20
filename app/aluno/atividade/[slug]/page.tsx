import { DuetRecorder } from '@/components/duet-recorder';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function drivePreview(url?: string | null) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : url || '';
}

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: lesson } = await supabase
    .from('exercises')
    .select('id,title,slug,description,drive_url,media_url,audio_url,modules(title,slug)')
    .eq('slug', slug)
    .single();

  const module = Array.isArray(lesson?.modules) ? lesson?.modules[0] : lesson?.modules;
  const referenceUrl = lesson?.media_url || lesson?.drive_url || lesson?.audio_url || '';

  return (
    <main className="activity-page">
      <header className="activity-topbar">
        <a href={`/aluno/aula/${lesson?.slug || slug}`}>← Voltar para aula</a>
        <strong>{module?.title || 'Atividade VIP'}</strong>
      </header>
      <DuetRecorder
        lessonTitle={lesson?.title || 'Atividade'}
        lessonSlug={lesson?.slug || slug}
        referenceUrl={referenceUrl}
        referenceEmbedUrl={drivePreview(referenceUrl)}
      />
    </main>
  );
}
