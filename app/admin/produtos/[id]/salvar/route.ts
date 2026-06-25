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

function redirectTo(request: Request, id: string, params: Record<string, string>) {
  const url = new URL(`/admin/produtos/${id}`, request.url);
  url.searchParams.set('tab', 'configuracoes');
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

async function safeUpdate(table: string, id: string, payload: Record<string, unknown>, fallback: Record<string, unknown>) {
  const supabase = createAdminClient();
  const first = await supabase.from(table).update(payload).eq('id', id);
  if (!first.error) return first;
  const message = String(first.error.message || '').toLowerCase();
  if (message.includes('updated_at') || message.includes('schema cache') || message.includes('column')) {
    return supabase.from(table).update(fallback).eq('id', id);
  }
  return first;
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
    const redirectUrl = normalizeUrl(String(formData.get('redirect_url') || formData.get('sales_page_url') || '').trim());
    let coverUrl = removeCover ? '' : String(formData.get('cover_url') || '').trim();

    if (!name) return redirectTo(request, id, { error: 'nome' });

    const coverFile = formData.get('cover_file');
    if (!removeCover && coverFile instanceof File && coverFile.size > 0) {
      const uploadedUrl = await uploadCover(supabase, coverFile, id);
      if (uploadedUrl) coverUrl = uploadedUrl;
    }

    const baseProductPayload = {
      name,
      slug,
      description,
      status,
      billing_type: billingType,
      type: billingType === 'recurring' ? 'subscription' : 'course',
      price_cents: Math.round(price * 100),
      cover_url: coverUrl,
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
      type: billingType === 'recurring' ? 'subscription' : 'course',
      price_cents: Math.round(price * 100),
      cover_url: coverUrl,
    };
    const productResult = await safeUpdate('products', id, { ...baseProductPayload, updated_at: new Date().toISOString() }, fallbackProductPayload);
    if (productResult.error) return redirectTo(request, id, { error: 'produto', detail: productResult.error.message.slice(0, 80) });

    const baseCoursePayload = { title: name, slug, description, cover_url: coverUrl, status, redirect_url: redirectUrl, sales_page_url: redirectUrl, sales_url: redirectUrl, external_url: redirectUrl };
    const fallbackCoursePayload = { title: name, slug, description, cover_url: coverUrl, status };
    if (courseId) {
      const courseResult = await safeUpdate('courses', courseId, { ...baseCoursePayload, updated_at: new Date().toISOString() }, fallbackCoursePayload);
      if (courseResult.error) return redirectTo(request, id, { error: 'curso', detail: courseResult.error.message.slice(0, 80) });
    } else {
      const { data: existingCourse } = await supabase.from('courses').select('id').eq('product_id', id).limit(1).maybeSingle();
      if (existingCourse?.id) {
        await safeUpdate('courses', existingCourse.id, { ...baseCoursePayload, updated_at: new Date().toISOString() }, fallbackCoursePayload);
      } else {
        const insertResult = await supabase.from('courses').insert({ product_id: id, ...fallbackCoursePayload, sort_order: 0 });
        if (insertResult.error) return redirectTo(request, id, { error: 'curso', detail: insertResult.error.message.slice(0, 80) });
      }
    }

    revalidatePath(`/admin/produtos/${id}`);
    revalidatePath('/admin/produtos');
    revalidatePath('/aluno');
    revalidatePath('/aluno/biblioteca');
    return redirectTo(request, id, { saved: '1', t: String(Date.now()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'save-failed';
    if (message === 'cover-too-large') return redirectTo(request, id, { error: 'capa-grande' });
    return redirectTo(request, id, { error: 'salvar', detail: message.slice(0, 80) });
  }
}
