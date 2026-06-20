import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/google/drive-utils';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  const lessonId = String(formData.get('lesson_id') || '');
  const title = String(formData.get('title') || '').trim();

  if (!lessonId || !title) {
    return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?erro=titulo`, request.url));
  }

  const supabase = createAdminClient();
  await supabase
    .from('exercises')
    .update({ title, slug: `${slugify(title)}-${lessonId.slice(0, 6)}`, updated_at: new Date().toISOString() })
    .eq('id', lessonId)
    .eq('module_id', id);

  return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?sucesso=titulo`, request.url));
}
