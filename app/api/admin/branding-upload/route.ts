import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'branding-assets';
const ALLOWED_ASSETS = new Set(['logo', 'favicon', 'login', 'hero', 'og']);
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

export async function POST(request: Request) {
  try {
    const ok = await ensureBucket();
    if (!ok) return NextResponse.json({ error: 'Não foi possível preparar o bucket de branding.' }, { status: 500 });

    const form = await request.formData();
    const asset = String(form.get('asset') || '').trim().toLowerCase();
    const file = form.get('file');

    if (!ALLOWED_ASSETS.has(asset)) return NextResponse.json({ error: 'Tipo de imagem inválido.' }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.has(file.type)) return NextResponse.json({ error: 'Envie apenas imagens PNG, JPG ou WEBP.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE_BYTES) return NextResponse.json({ error: 'Imagem muito grande. O limite é 8MB.' }, { status: 400 });

    const extension = asset === 'favicon' ? 'png' : 'webp';
    const contentType = asset === 'favicon' ? 'image/png' : 'image/webp';
    const key = `identity/${asset}.${extension}`;
    const bytes = await file.arrayBuffer();
    const supabase = createAdminClient();

    const { error } = await supabase.storage.from(BUCKET).upload(key, bytes, { contentType, upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
    const version = Date.now();
    const separator = data.publicUrl.includes('?') ? '&' : '?';
    const url = `${data.publicUrl}${separator}v=${version}`;

    return NextResponse.json({ ok: true, success: true, asset, key, url, version });
  } catch (error) {
    console.error('Falha no upload de branding', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro inesperado no upload de branding.' }, { status: 500 });
  }
}
