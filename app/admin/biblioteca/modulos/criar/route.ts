import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/google/drive-utils';

export async function POST(request: Request) {
  const formData = await request.formData();
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const sort_order = Number(formData.get('sort_order') || 1);

  if (!title) return NextResponse.redirect(new URL('/admin/biblioteca/novo-modulo?erro=titulo', request.url));

  const supabase = createAdminClient();
  await supabase.from('modules').insert({
    title,
    slug: `${slugify(title)}-${Date.now().toString(36)}`,
    description,
    sort_order,
    is_active: true,
  });

  return NextResponse.redirect(new URL('/admin/biblioteca?sucesso=modulo', request.url));
}
