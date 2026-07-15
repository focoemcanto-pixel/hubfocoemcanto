import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'branding-assets';
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

async function ensureBucket() {
  const supabase = createAdminClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.id === BUCKET || bucket.name === BUCKET);
  if (exists) return true;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  return !error;
}

export async function POST(request: NextRequest) {
  const accessEmail = request.cookies.get('hub_access_email')?.value;
  if (!accessEmail) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    const ok = await ensureBucket();
    if (!ok) return NextResponse.json({ error: 'Não foi possível preparar o armazenamento.' }, { status: 500 });

    const form = await request.formData();
    const file = form.get('file');
    const slug = String(form.get('slug') || 'live').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'live';

    if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.has(file.type)) return NextResponse.json({ error: 'Envie uma imagem PNG, JPG ou WEBP.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE_BYTES) return NextResponse.json({ error: 'Imagem muito grande. O limite é 8MB.' }, { status: 400 });

    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const key = `live-share-cards/${slug}-${Date.now()}.${extension}`;
    const bytes = await file.arrayBuffer();
    const supabase = createAdminClient();
    const { error } = await supabase.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
    return NextResponse.json({ ok: true, url: data.publicUrl, key });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro inesperado no upload.' }, { status: 500 });
  }
}
