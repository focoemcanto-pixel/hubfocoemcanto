import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const lessonId = String(body?.lesson_id || '').trim();
  const title = String(body?.title || '').trim();

  if (!lessonId || !title) {
    return NextResponse.json({ ok: false, error: 'Dados inválidos.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('exercises').update({ title }).eq('id', lessonId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, title });
}
