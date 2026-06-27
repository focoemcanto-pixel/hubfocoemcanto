import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle, streamHlsUrl, streamThumbnailUrl } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_NAME_LENGTH = 180;

type ExerciseRow = { id: string; title?: string | null; slug?: string | null; module_id?: string | null };

function streamConfig() {
  return { accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '', token: process.env.CLOUDFLARE_STREAM_TOKEN || '' };
}

function isVideo(fileName: string, contentType: string) {
  return contentType.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(fileName);
}

function metaValue(value: unknown) {
  return String(value ?? '').slice(0, 500);
}

function score(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return Math.min(98, Math.round((Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 100) + 18);
  const aw = new Set(a.split(/\s+/).filter(Boolean));
  const bw = new Set(b.split(/\s+/).filter(Boolean));
  const common = [...aw].filter((word) => bw.has(word)).length;
  return Math.round((common / (new Set([...aw, ...bw]).size || 1)) * 100);
}

function bestMatch(title: string, exercises: ExerciseRow[]) {
  const normalized = normalizeMediaTitle(title);
  const ranked = exercises.map((exercise) => ({ exercise, score: Math.max(score(normalized, normalizeMediaTitle(exercise.title)), score(normalized, normalizeMediaTitle(exercise.slug))) })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 62 ? ranked[0] : null;
}

async function createStreamUpload(fileName: string, productId: string, moduleId: string, relativePath: string, size: number) {
  const supabase = createAdminClient();
  const [{ data: product }, { data: module }] = await Promise.all([
    supabase.from('products').select('id,slug,name').eq('id', productId).maybeSingle(),
    supabase.from('modules').select('id,slug,title').eq('id', moduleId).maybeSingle(),
  ]);
  if (!product?.id || !module?.id) throw new Error('Produto ou módulo inválido.');

  const { accountId, token } = streamConfig();
  if (!accountId || !token) throw new Error('Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.');

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      maxDurationSeconds: 14400,
      requireSignedURLs: false,
      meta: {
        name: metaValue(fileName),
        productId: metaValue(productId),
        productSlug: metaValue(product.slug),
        productName: metaValue(product.name),
        moduleId: metaValue(moduleId),
        moduleSlug: metaValue(module.slug),
        moduleTitle: metaValue(module.title),
        relativePath: metaValue(relativePath),
        size: metaValue(size),
        source: 'hubfocoemcanto-admin-server-upload',
      },
    }),
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) {
    const details = Array.isArray(json?.errors) ? json.errors.map((item: any) => item?.message || item?.code).filter(Boolean).join(' · ') : '';
    throw new Error(details || `Cloudflare Stream respondeu ${response.status}.`);
  }
  const uid = String(json?.result?.uid || '');
  const uploadUrl = String(json?.result?.uploadURL || '');
  if (!uid || !uploadUrl) throw new Error('Cloudflare não retornou URL de upload do Stream.');
  return { uid, uploadUrl };
}

async function uploadFileToStream(uploadUrl: string, file: File) {
  const form = new FormData();
  form.append('file', file, file.name);
  const response = await fetch(uploadUrl, { method: 'POST', body: form, cache: 'no-store' });
  const text = await response.text().catch(() => '');
  if (!response.ok) throw new Error(text || `Upload no Cloudflare Stream falhou (${response.status}).`);
}

async function saveStreamAsset(productId: string, moduleId: string, title: string, uid: string, relativePath: string, size: number | null) {
  const supabase = createAdminClient();
  const { data: exercises, error: exercisesError } = await supabase.from('exercises').select('id,title,slug,module_id').eq('module_id', moduleId).limit(800);
  if (exercisesError) throw exercisesError;

  const match = bestMatch(title, (exercises || []) as ExerciseRow[]);
  const status = 'queued';
  const thumbnail = streamThumbnailUrl(uid);
  const mediaUrl = streamHlsUrl(uid);
  const payload = {
    provider: 'cloudflare_stream',
    media_type: 'video',
    product_id: productId,
    module_id: moduleId,
    exercise_id: match?.exercise.id || null,
    title,
    normalized_title: normalizeMediaTitle(title),
    stream_uid: uid,
    thumbnail_url: thumbnail,
    status,
    raw: { relativePath, size, matchScore: match?.score || 0, uploadedFrom: 'admin-media-uploader-server' },
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase.from('media_assets').select('id').eq('stream_uid', uid).maybeSingle();
  const assetResponse = existing?.id
    ? await supabase.from('media_assets').update(payload).eq('id', existing.id).select('id').single()
    : await supabase.from('media_assets').insert(payload).select('id').single();
  if (assetResponse.error) throw assetResponse.error;

  if (match) {
    const { error } = await supabase.from('exercises').update({ stream_uid: uid, stream_status: status, stream_thumbnail_url: thumbnail, stream_synced_at: new Date().toISOString(), media_url: mediaUrl, media_type: 'video' }).eq('id', match.exercise.id);
    if (error) throw error;
  }

  return { assetId: assetResponse.data?.id, linked: Boolean(match), exerciseId: match?.exercise.id || null, status };
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'missing_file', message: 'Selecione um vídeo para enviar.' }, { status: 400 });

    const fileName = String(form.get('fileName') || file.name || '').trim();
    const contentType = String(form.get('contentType') || file.type || 'video/mp4').trim() || 'video/mp4';
    const productId = String(form.get('productId') || '').trim();
    const moduleId = String(form.get('moduleId') || '').trim();
    const relativePath = String(form.get('relativePath') || fileName).trim();
    const size = Number(form.get('size') || file.size || 0) || 0;

    if (!fileName || fileName.length > MAX_NAME_LENGTH) return NextResponse.json({ error: 'invalid_file_name', message: 'Nome de arquivo inválido.' }, { status: 400 });
    if (!isVideo(fileName, contentType)) return NextResponse.json({ error: 'invalid_video', message: 'O Cloudflare Stream deve receber apenas vídeos.' }, { status: 400 });
    if (!productId) return NextResponse.json({ error: 'missing_product_id', message: 'Informe o produto.' }, { status: 400 });
    if (!moduleId) return NextResponse.json({ error: 'missing_module_id', message: 'Selecione o módulo de destino.' }, { status: 400 });

    const { uid, uploadUrl } = await createStreamUpload(fileName, productId, moduleId, relativePath, size);
    await uploadFileToStream(uploadUrl, file);
    const saved = await saveStreamAsset(productId, moduleId, fileName, uid, relativePath, size || null);
    return NextResponse.json({ uid, ...saved });
  } catch (error) {
    return NextResponse.json({ error: 'stream_server_upload_failed', message: error instanceof Error ? error.message : 'Não foi possível enviar o vídeo para o Stream.' }, { status: 500 });
  }
}
