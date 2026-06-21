import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/google/drive-utils';

const ASSETS_BUCKET = 'hub-assets';

async function uploadModuleCover(file: File, moduleId: string) {
  if (!file || file.size === 0) return '';
  if (!file.type.startsWith('image/')) return '';

  const supabase = createAdminClient();
  await supabase.storage.createBucket(ASSETS_BUCKET, { public: true }).catch(() => undefined);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `modules/${moduleId}/cover-${Date.now()}.${safeExt}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, bytes, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  });

  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const pastedCoverUrl = String(formData.get('cover_url') || '').trim();
  const coverFile = formData.get('cover_file');
  const sort_order = Number(formData.get('sort_order') || 1);

  if (!title) return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?erro=titulo`, request.url));

  let cover_url = pastedCoverUrl;
  if (coverFile instanceof File && coverFile.size > 0) {
    cover_url = await uploadModuleCover(coverFile, id);
  }

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
