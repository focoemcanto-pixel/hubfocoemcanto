import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ASSETS_BUCKET = 'hub-assets';
const MAX_COVER_SIZE = 8 * 1024 * 1024;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `produto-${Date.now()}`;
}

function parseMoney(value: FormDataEntryValue | null) {
  const raw = String(value || '0').trim();
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function redirectBack(request: Request, id: string, key: string) {
  return NextResponse.redirect(new URL(`/admin/produtos/${id}?tab=configuracoes&error=${encodeURIComponent(key)}`, request.url));
}

async function ensureBucket() {
  const supabase = createAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(listError.message);
  const exists = buckets?.some((bucket) => bucket.id === ASSETS_BUCKET || bucket.name === ASSETS_BUCKET);
  if (exists) return;
  const { error } = await supabase.storage.createBucket(ASSETS_BUCKET, { public: true });
  if (error && !String(error.message).toLowerCase().includes('already')) throw new Error(error.message);
}

async function uploadCover(file: File, productId: string) {
  if (!file || file.size === 0 || !file.type.startsWith('image/')) return '';
  if (file.size > MAX_COVER_SIZE) throw new Error('cover-too-large');
  await ensureBucket();
  const supabase = createAdminClient();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `products/${productId}/cover-${Date.now()}.${safeExt}`;
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

  try {
    const formData = await request.formData();
    const supabase = createAdminClient();

    const courseId = String(formData.get('course_id') || '').trim();
    const name = String(formData.get('name') || '').trim();
    const rawSlug = String(formData.get('slug') || '').trim();
    const slug = rawSlug ? slugify(rawSlug) : slugify(name);
    const description = String(formData.get('description') || '').trim();
    const status = String(formData.get('status') || 'draft');
    const billingType = String(formData.get('billing_type') || 'one_time');
    const removeCover = String(formData.get('remove_cover') || '') === '1';
    const price = parseMoney(formData.get('price'));
    let coverUrl = removeCover ? '' : String(formData.get('cover_url') || '').trim();

    if (!name) return redirectBack(request, id, 'nome');

    const coverFile = formData.get('cover_file');
    if (!removeCover && coverFile instanceof File && coverFile.size > 0) {
      const uploadedUrl = await uploadCover(coverFile, id);
      if (uploadedUrl) coverUrl = uploadedUrl;
    }

    const payload = {
      name,
      slug,
      description,
      status,
      billing_type: billingType,
      type: billingType === 'recurring' ? 'subscription' : 'course',
      price_cents: Math.round(price * 100),
      cover_url: coverUrl,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('products').update(payload).eq('id', id);
    if (error) return redirectBack(request, id, 'produto');

    if (courseId) {
      const { error: courseError } = await supabase.from('courses').update({
        title: name,
        slug,
        description,
        cover_url: coverUrl,
        status,
        updated_at: new Date().toISOString(),
      }).eq('id', courseId);
      if (courseError) return redirectBack(request, id, 'curso');
    } else {
      const { error: courseInsertError } = await supabase.from('courses').insert({
        product_id: id,
        title: name,
        slug,
        description,
        cover_url: coverUrl,
        status,
        sort_order: 0,
      });
      if (courseInsertError) return redirectBack(request, id, 'curso');
    }

    return NextResponse.redirect(new URL(`/admin/produtos/${id}?tab=configuracoes&saved=1`, request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'save-failed';
    if (message === 'cover-too-large') return redirectBack(request, id, 'capa-grande');
    return redirectBack(request, id, 'salvar');
  }
}
