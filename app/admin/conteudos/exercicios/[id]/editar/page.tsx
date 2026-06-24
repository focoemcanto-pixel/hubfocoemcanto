import { createAdminClient } from '@/lib/supabase/admin';
import { AdminVideoTrimEditor } from '@/components/admin-video-trim-editor';

export const dynamic = 'force-dynamic';

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data: exercise }, { data: modules }] = await Promise.all([
    supabase.from('exercises').select('*').eq('id', id).single(),
    supabase.from('modules').select('id,title').order('sort_order'),
  ]);

  return <AdminVideoTrimEditor exercise={exercise || { id }} modules={modules || []} />;
}
