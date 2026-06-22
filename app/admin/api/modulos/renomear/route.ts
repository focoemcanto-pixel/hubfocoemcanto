import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/google/drive-utils';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const moduleId = String(body?.module_id || '').trim();
  const title = String(body?.title || '').trim();

  if (!moduleId || !title) {
    return NextResponse.json({ ok: false, error: 'Dados invalidos.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('modules')
    .update({ title, slug: `${slugify(title)}-${moduleId.slice(0, 6)}` })
    .eq('id', moduleId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, title });
}
