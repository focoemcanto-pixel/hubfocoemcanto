import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeR2RuntimeEnv, normalizeRuntimeUrl } from '@/lib/r2-runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Row = any;
type R2BucketLike = {
  put: (key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>;
};

function msg(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'unknown_error');
}

function safe(value?: string | null) {
  return String(value || 'item')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function cleanFileName(fileName: string) {
  const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';
  const base = fileName.replace(/\.[^/.]+$/, '');
  const cleanBase = safe(base).slice(0, 90) || 'media';
  return extension ? `${cleanBase}.${safe(extension).replace(/\./g, '')}` : cleanBase;
}

function fileId(url?: string | null) {
  const value = String(url || '');
  return (value.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || value.match(/id=([a-zA-Z0-9_-]+)/) || value.match(/\/d\/([a-zA-Z0-9_-]+)/))?.[1] || '';
}

function r2Base() {
  return normalizeRuntimeUrl(process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '');
}

function publicUrlForKey(key: string) {
  return `${r2Base()}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function getR2Bucket(): R2BucketLike | null {
  try {
    const context = getCloudflareContext();
    const env = (context?.env || {}) as Record<string, unknown>;
    const candidates = ['MEDIA_BUCKET', 'HUB_MEDIA', 'R2_MEDIA_BUCKET', 'R2_BUCKET_BINDING', 'R2_BUCKET'];
    for (const name of candidates) {
      const bucket = env[name] as R2BucketLike | undefined;
      if (bucket && typeof bucket.put === 'function') return bucket;
    }
    return null;
  } catch {
    return null;
  }
}

async function driveToken() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('google_drive_connections').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.access_token) throw new Error('google_drive_not_connected');

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000 || !data.refresh_token) return String(data.access_token);

  const refresh = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: String(data.refresh_token),
      grant_type: 'refresh_token',
    }),
  });

  if (!refresh.ok) {
    const detail = await refresh.text().catch(() => '');
    throw new Error(`google_refresh_failed_${refresh.status}: ${detail.slice(0, 180)}`);
  }

  const json = await refresh.json();
  const nextExpiresAt = Date.now() + Number(json.expires_in || 3600) * 1000;

  await supabase.from('google_drive_connections').upsert({
    id: data.id,
    access_token: json.access_token,
    refresh_token: data.refresh_token,
    scope: json.scope || data.scope,
    token_type: json.token_type || data.token_type,
    expires_at: new Date(nextExpiresAt).toISOString(),
    updated_at: new Date().toISOString(),
  });

  return String(json.access_token);
}

async function productModules(productId: string) {
  const supabase = createAdminClient();
  const { data: product } = await supabase.from('products').select('id,name,slug').eq('id', productId).maybeSingle();
  const { data: course } = await supabase.from('courses').select('id').eq('product_id', productId).order('created_at', { ascending: true }).limit(1).maybeSingle();

  let ids: string[] = [];
  if (course?.id) {
    const { data: links } = await supabase.from('course_module_links').select('module_id').eq('course_id', course.id);
    ids = ((links || []) as Row[]).map((item) => String(item.module_id));
  }

  if (!ids.length) {
    const { data: modules } = await supabase.from('modules').select('id,description,is_active').eq('is_active', true).order('sort_order', { ascending: true });
    ids = ((modules || []) as Row[])
      .filter((module) => !String(module.description || '').toLowerCase().includes('importados da pasta'))
      .map((module) => String(module.id));
  }

  const { data: modules } = ids.length
    ? await supabase.from('modules').select('id,title,slug').in('id', ids)
    : { data: [] };

  return { product, ids, modules: new Map(((modules || []) as Row[]).map((m) => [String(m.id), m])) };
}

async function migrateExercise(exercise: Row, product: Row, module: Row, token: string, bucket: R2BucketLike) {
  let step = 'start';
  try {
    normalizeR2RuntimeEnv();
    const id = fileId(exercise.drive_url);
    if (!id) return { id: exercise.id, title: exercise.title, status: 'failed', step: 'file_id', reason: 'invalid_drive_url' };

    step = 'drive_metadata';
    const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType,size&supportsAllDrives=true`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const metadata = metadataResponse.ok ? await metadataResponse.json() : null;

    step = 'drive_download';
    const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!driveResponse.ok || !driveResponse.body) {
      return { id: exercise.id, title: exercise.title, status: 'failed', step, reason: `drive_${driveResponse.status}`, detail: (await driveResponse.text().catch(() => '')).slice(0, 180) };
    }

    const type = metadata?.mimeType || driveResponse.headers.get('content-type') || 'video/mp4';
    const name = metadata?.name || `${safe(exercise.title || exercise.slug)}.mp4`;
    const folder = `produtos/${safe(product?.slug || product?.name || 'produto')}/${safe(module?.slug || module?.title || 'modulo')}/originals`;
    const key = `${folder}/${Date.now()}-${cleanFileName(name)}`;
    const publicUrl = publicUrlForKey(key);

    step = 'r2_binding_put';
    await bucket.put(key, driveResponse.body, { httpMetadata: { contentType: type } });

    step = 'public_check';
    const check = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' });
    if (!check.ok) return { id: exercise.id, title: exercise.title, status: 'failed', step, reason: `public_${check.status}`, mediaUrl: publicUrl };

    step = 'database_update';
    const supabase = createAdminClient();
    const { error } = await supabase.from('exercises').update({ media_url: publicUrl, media_type: type.startsWith('audio/') ? 'audio' : 'video' }).eq('id', exercise.id);
    if (error) return { id: exercise.id, title: exercise.title, status: 'failed', step, reason: error.message };

    return { id: exercise.id, title: exercise.title, moduleTitle: module?.title, status: 'migrated', mediaUrl: publicUrl, folder, key };
  } catch (error) {
    return { id: exercise.id, title: exercise.title, status: 'failed', step, reason: msg(error) };
  }
}

export async function POST(request: Request) {
  try {
    const email = (await cookies()).get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const bucket = getR2Bucket();
    if (!bucket) return NextResponse.json({ error: 'r2_binding_missing', message: 'Configure um R2 bucket binding chamado MEDIA_BUCKET no Cloudflare.' }, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const productId = String(body.productId || '');
    const exerciseId = String(body.exerciseId || '');
    const limit = Math.max(1, Math.min(5, Number(body.limit || 1)));
    if (!productId && !exerciseId) return NextResponse.json({ error: 'missing_product_or_exercise' }, { status: 400 });

    const supabase = createAdminClient();
    const scope = productId ? await productModules(productId) : { product: null, ids: [], modules: new Map() };

    let query = supabase.from('exercises').select('id,title,slug,drive_url,media_url,media_type,module_id').not('drive_url', 'is', null).order('sort_order', { ascending: true }).limit(limit);
    if (exerciseId) query = query.eq('id', exerciseId).limit(1);
    else if (scope.ids.length) query = query.in('module_id', scope.ids).limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const token = await driveToken();
    const results = [];
    for (const exercise of ((data || []) as Row[])) {
      const module = scope.modules.get(String(exercise.module_id)) || {};
      results.push(await migrateExercise(exercise, scope.product || {}, module, token, bucket));
    }

    return NextResponse.json({ total: results.length, r2Base: r2Base(), results });
  } catch (error) {
    return NextResponse.json({ error: 'migration_v2_failed', message: msg(error) }, { status: 500 });
  }
}
