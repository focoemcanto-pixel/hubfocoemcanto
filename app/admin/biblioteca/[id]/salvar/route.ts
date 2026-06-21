import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/google/drive-utils';

const ASSETS_BUCKET = 'hub-assets';

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}

async function ensureAssetsBucket() {
  const supabase = createAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) return { ok: false, error: listError.message };

  const exists = buckets?.some((bucket) => bucket.id === ASSETS_BUCKET || bucket.name === ASSETS_BUCKET);
  if (exists) return { ok: true };

  const { error: createError } = await supabase.storage.createBucket(ASSETS_BUCKET, { public: true });
  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    return { ok: false, error: createError.message };
  }

  return { ok: true };
}

async function uploadModuleCover(file: File, moduleId: string) {
  if (!file || file.size === 0) return { ok: true, url: '' };
  if (!file.type.startsWith('image/')) return { ok: false, error: 'Arquivo de capa inválido. Envie PNG, JPG ou WEBP.' };

  const bucket = await ensureAssetsBucket();
  if (!bucket.ok) return { ok: false, error: bucket.error || 'Não consegui preparar o bucket de imagens.' };

  const supabase = createAdminClient();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `modules/${moduleId}/cover-${Date.now()}.${safeExt}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, bytes, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  });

  if (error) return { ok: false, error: error.message };
  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const formData = await request.formData();
    const title = String(formData.get('title') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const pastedCoverUrl = String(formData.get('cover_url') || '').trim();
    const removeCover = String(formData.get('remove_cover') || '') === '1';
    const coverFile = formData.get('cover_file');
    const sort_order = Number(formData.get('sort_order') || 1);

    if (!title) return redirectTo(request, `/admin/biblioteca/${id}?erro=titulo`);

    let cover_url = removeCover ? '' : pastedCoverUrl;
    if (!removeCover && coverFile instanceof File && coverFile.size > 0) {
      const upload = await uploadModuleCover(coverFile, id);
      if (!upload.ok) {
        return redirectTo(request, `/admin/biblioteca/${id}?erro=${encodeURIComponent(upload.error || 'upload_capa')}`);
      }
      cover_url = upload.url || cover_url;
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from('modules').update({
      title,
      slug: `${slugify(title)}-${id.slice(0, 6)}`,
      description,
      cover_url,
      sort_order: Number.isFinite(sort_order) ? sort_order : 1,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (error) return redirectTo(request, `/admin/biblioteca/${id}?erro=${encodeURIComponent(error.message)}`);
    return redirectTo(request, `/admin/biblioteca/${id}?sucesso=salvo`);
  } catch (error) {
    return redirectTo(request, `/admin/biblioteca/${id}?erro=${encodeURIComponent(error instanceof Error ? error.message : 'erro_ao_salvar')}`);
  }
}
