import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/google/drive-utils';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const cover_url = String(formData.get('cover_url') || '').trim();
  const sort_order = Number(formData.get('sort_order') || 1);

  if (!title) return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?erro=titulo`, request.url));

  const supabase = createAdminClient();
  await supabase.from('modules').update({
    title,
    slug: `${slugify(title)}-${id.slice(0, 6)}`,
    description,
    cover_url,
    sort_order,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?sucesso=salvo`, request.url));
}
