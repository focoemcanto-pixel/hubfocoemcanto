import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/google/drive-utils';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contentType = request.headers.get('content-type') || '';

  let lessonId = '';
  let title = '';

  if (contentType.includes('application/json')) {
    const body = await request.json();
    lessonId = String(body.lesson_id || '');
    title = String(body.title || '').trim();
  } else {
    const formData = await request.formData();
    lessonId = String(formData.get('lesson_id') || '');
    title = String(formData.get('title') || '').trim();
  }

  if (!lessonId || !title) {
    if (contentType.includes('application/json')) {
      return NextResponse.json({ error: 'missing_title' }, { status: 400 });
    }
    return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?erro=titulo`, request.url));
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('exercises')
    .update({ title, slug: `${slugify(title)}-${lessonId.slice(0, 6)}`, updated_at: new Date().toISOString() })
    .eq('id', lessonId)
    .eq('module_id', id);

  if (error) {
    if (contentType.includes('application/json')) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?erro=${encodeURIComponent(error.message)}`, request.url));
  }

  if (contentType.includes('application/json')) {
    return NextResponse.json({ ok: true, title });
  }

  return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?sucesso=titulo`, request.url));
}
