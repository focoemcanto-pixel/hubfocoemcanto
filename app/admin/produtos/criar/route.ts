import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

const ASSETS_BUCKET = 'hub-assets';
const MAX_COVER_SIZE = 8 * 1024 * 1024;

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `produto-${Date.now()}`;
}

function parseMoney(value: FormDataEntryValue | null) {
  const raw = String(value || '0').trim();
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeUrl(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function redirectTo(request: Request, params: Record<string, string>, productId?: string) {
  const path = productId ? `/admin/produtos/${productId}` : '/admin/produtos';
  const url = new URL(path, request.url);
  if (productId) url.searchParams.set('tab', 'configuracoes');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url, { status: 303 });
}

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) return;
  const exists = buckets?.some((bucket) => bucket.id === ASSETS_BUCKET || bucket.name === ASSETS_BUCKET);
  if (exists) return;
  await supabase.storage.createBucket(ASSETS_BUCKET, { public: true }).catch(() => null);
}

async function uploadCover(supabase: ReturnType<typeof createAdminClient>, file: File, productId: string) {
  if (!file || file.size === 0 || !file.type.startsWith('image/')) return '';
  if (file.size > MAX_COVER_SIZE) throw new Error('cover-too-large');
  await ensureBucket(supabase);
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `products/${productId}/cover-${Date.now()}.${safeExt}`;
  const bytes = await file.arrayBuffer();
  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function safeInsert(table: string, payload: Record<string, unknown>, fallback: Record<string, unknown>) {
  const supabase = createAdminClient();
  const first = await supabase.from(table).insert(payload).select('id').single();
  if (!first.error) return first;
  const message = String(first.error.message || '').toLowerCase();
  if (message.includes('schema cache') || message.includes('column')) return supabase.from(table).insert(fallback).select('id').single();
  return first;
}

async function safeUpdate(table: string, id: string, payload: Record<string, unknown>, fallback: Record<string, unknown>) {
  const supabase = createAdminClient();
  const first = await supabase.from(table).update(payload).eq('id', id);
  if (!first.error) return first;
  const message = String(first.error.message || '').toLowerCase();
  if (message.includes('schema cache') || message.includes('column') || message.includes('updated_at')) return supabase.from(table).update(fallback).eq('id', id);
  return first;
}

export async function POST(request: Request) {
  let createdId = '';
  try {
    const formData = await request.formData();
    const supabase = createAdminClient();

    const name = String(formData.get('name') || '').trim();
    const rawSlug = String(formData.get('slug') || '').trim();
    const slug = rawSlug ? slugify(rawSlug) : slugify(name);
    const description = String(formData.get('description') || '').trim();
    const billingType = String(formData.get('billing_type') || 'one_time');
    const productType = String(formData.get('type') || (billingType === 'recurring' ? 'subscription' : 'course'));
    const status = String(formData.get('status') || 'draft') === 'published' ? 'published' : 'draft';
    const price = parseMoney(formData.get('price'));
    const redirectUrl = normalizeUrl(String(formData.get('redirect_url') || formData.get('sales_page_url') || '').trim());
    let coverUrl = normalizeUrl(String(formData.get('cover_url') || '').trim());

    if (!name) return redirectTo(request, { created: '0', error: 'nome' });

    const baseProductPayload = {
      name,
      slug,
      description,
      status,
      billing_type: billingType,
      type: productType,
      price_cents: Math.round(price * 100),
      cover_url: coverUrl,
      cta_label: 'Acessar',
      redirect_url: redirectUrl,
      sales_page_url: redirectUrl,
      sales_url: redirectUrl,
      external_url: redirectUrl,
    };
    const fallbackProductPayload = {
      name,
      slug,
      description,
      status,
      billing_type: billingType,
      type: productType,
      price_cents: Math.round(price * 100),
      cover_url: coverUrl,
      cta_label: 'Acessar',
    };

    const productResult = await safeInsert('products', baseProductPayload, fallbackProductPayload);
    if (productResult.error || !productResult.data?.id) return redirectTo(request, { created: '0', error: 'produto', detail: String(productResult.error?.message || '').slice(0, 80) });
    createdId = productResult.data.id;

    const coverFile = formData.get('cover_file');
    if (coverFile instanceof File && coverFile.size > 0) {
      const uploadedUrl = await uploadCover(supabase, coverFile, createdId);
      if (uploadedUrl) {
        coverUrl = uploadedUrl;
        await safeUpdate('products', createdId, { cover_url: coverUrl, updated_at: new Date().toISOString() }, { cover_url: coverUrl });
      }
    }

    const { data: last } = await supabase.from('courses').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const sortOrder = Number(last?.sort_order || 0) + 1;
    const baseCoursePayload = {
      product_id: createdId,
      title: name,
      slug,
      subtitle: description.slice(0, 140),
      description,
      cover_url: coverUrl,
      status,
      sort_order: sortOrder,
      redirect_url: redirectUrl,
      sales_page_url: redirectUrl,
      sales_url: redirectUrl,
      external_url: redirectUrl,
    };
    const fallbackCoursePayload = {
      product_id: createdId,
      title: name,
      slug,
      subtitle: description.slice(0, 140),
      description,
      cover_url: coverUrl,
      status,
      sort_order: sortOrder,
    };
    const courseResult = await safeInsert('courses', baseCoursePayload, fallbackCoursePayload);
    if (courseResult.error) return redirectTo(request, { created: '0', error: 'curso', detail: courseResult.error.message.slice(0, 80) }, createdId);

    revalidatePath('/admin/produtos');
    revalidatePath(`/admin/produtos/${createdId}`);
    revalidatePath('/aluno');
    revalidatePath('/aluno/biblioteca');
    return redirectTo(request, { created: '1', saved: '1', t: String(Date.now()) }, createdId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create-failed';
    if (message === 'cover-too-large') return redirectTo(request, { created: '0', error: 'capa-grande' }, createdId || undefined);
    return redirectTo(request, { created: '0', error: 'criar', detail: message.slice(0, 80) }, createdId || undefined);
  }
}
