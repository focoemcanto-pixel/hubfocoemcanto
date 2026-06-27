import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle, streamHlsUrl, streamThumbnailUrl } from '@/lib/media/cloudflare-stream';
import { slugify } from '@/lib/google/drive-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = { productId?: string; moduleId?: string; title?: string; uid?: string; relativePath?: string; size?: number; createMissing?: boolean };
type ExerciseRow = { id: string; title?: string | null; slug?: string | null; module_id?: string | null; stream_uid?: string | null };

function cleanTitle(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '').trim();
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
  const normalized = normalizeMediaTitle(cleanTitle(title));
  const exact = exercises.find((exercise) => normalizeMediaTitle(exercise.title) === normalized || normalizeMediaTitle(exercise.slug) === normalized);
  if (exact) return { exercise: exact, score: 100, exact: true };
  const ranked = exercises.map((exercise) => ({ exercise, score: Math.max(score(normalized, normalizeMediaTitle(exercise.title)), score(normalized, normalizeMediaTitle(exercise.slug))), exact: false })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 62 ? ranked[0] : null;
}

async function fetchStreamVideo(uid: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const token = process.env.CLOUDFLARE_STREAM_TOKEN || '';
  if (!accountId || !token) return null;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, { headers: { authorization: ['Bearer', token].join(' ') }, cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) return null;
  return json?.result || null;
}

async function uniqueExerciseSlug(supabase: ReturnType<typeof createAdminClient>, moduleId: string, baseTitle: string) {
  const base = slugify(cleanTitle(baseTitle)) || `aula-${Date.now().toString(36)}`;
  for (let i = 0; i < 50; i += 1) {
    const candidate = i ? `${base}-${i + 1}` : base;
    const { data } = await supabase.from('exercises').select('id').eq('module_id', moduleId).eq('slug', candidate).maybeSingle();
    if (!data?.id) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function createExerciseForVideo(supabase: ReturnType<typeof createAdminClient>, moduleId: string, title: string, uid: string, status: string, thumbnail: string, duration: number | null, mediaUrl: string) {
  const clean = cleanTitle(title);
  const normalized = normalizeMediaTitle(clean);

  const { data: existing } = await supabase.from('exercises').select('id,title,slug,module_id,stream_uid').eq('module_id', moduleId).limit(1000);
  const duplicate = ((existing || []) as ExerciseRow[]).find((item) => normalizeMediaTitle(item.title) === normalized || normalizeMediaTitle(item.slug) === normalized || item.stream_uid === uid);
  if (duplicate?.id) return { exerciseId: duplicate.id, created: false };

  const { count } = await supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('module_id', moduleId);
  const slug = await uniqueExerciseSlug(supabase, moduleId, clean);
  const { data, error } = await supabase.from('exercises').insert({
    module_id: moduleId,
    title: clean,
    slug,
    description: '',
    objective: 'Assista, pratique e envie sua resposta para avaliação.',
    media_type: 'video',
    difficulty: 1,
    media_url: mediaUrl,
    stream_uid: uid,
    stream_status: status,
    stream_thumbnail_url: thumbnail,
    stream_duration_seconds: duration,
    stream_synced_at: new Date().toISOString(),
    is_active: true,
    sort_order: (count || 0) + 1,
  }).select('id').single();
  if (error) throw error;
  return { exerciseId: data.id as string, created: true };
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as Body;
    const productId = String(body.productId || '').trim();
    const moduleId = String(body.moduleId || '').trim();
    const title = String(body.title || '').trim();
    const uid = String(body.uid || '').trim();
    const relativePath = String(body.relativePath || title).trim();
    const createMissing = body.createMissing !== false;

    if (!productId || !moduleId || !title || !uid) return NextResponse.json({ error: 'invalid_payload', message: 'Informe produto, módulo, título e UID.' }, { status: 400 });

    const supabase = createAdminClient();
    const video = await fetchStreamVideo(uid);
    const status = String(video?.status?.state || 'pendingupload');
    const duration = Number(video?.duration || 0) || null;
    const thumbnail = String(video?.thumbnail || '') || streamThumbnailUrl(uid);
    const mediaUrl = streamHlsUrl(uid);
    const normalizedTitle = normalizeMediaTitle(cleanTitle(title));

    const { data: exercises, error: exercisesError } = await supabase.from('exercises').select('id,title,slug,module_id,stream_uid').eq('module_id', moduleId).limit(800);
    if (exercisesError) throw exercisesError;

    let match = bestMatch(title, (exercises || []) as ExerciseRow[]);
    let createdExercise = false;

    if (!match && createMissing) {
      const created = await createExerciseForVideo(supabase, moduleId, title, uid, status, thumbnail, duration, mediaUrl);
      createdExercise = created.created;
      match = { exercise: { id: created.exerciseId, module_id: moduleId, title: cleanTitle(title), slug: slugify(cleanTitle(title)), stream_uid: uid }, score: 100, exact: true };
    }

    const assetPayload = {
      provider: 'cloudflare_stream',
      media_type: 'video',
      product_id: productId,
      module_id: moduleId,
      exercise_id: match?.exercise.id || null,
      title: cleanTitle(title),
      normalized_title: normalizedTitle,
      stream_uid: uid,
      thumbnail_url: thumbnail,
      duration_seconds: duration,
      status: match ? 'linked' : status,
      raw: { relativePath, stream: video, matchScore: match?.score || 0, uploadedVia: 'hub', createdExercise },
      updated_at: new Date().toISOString(),
    };

    const { data: existingByUid } = await supabase.from('media_assets').select('id').eq('stream_uid', uid).maybeSingle();
    const { data: existingByTitle } = existingByUid?.id ? { data: null as any } : await supabase
      .from('media_assets')
      .select('id')
      .eq('provider', 'cloudflare_stream')
      .eq('module_id', moduleId)
      .eq('normalized_title', normalizedTitle)
      .maybeSingle();

    const existingId = existingByUid?.id || existingByTitle?.id;
    const assetResult = existingId
      ? await supabase.from('media_assets').update(assetPayload).eq('id', existingId).select('id').single()
      : await supabase.from('media_assets').insert(assetPayload).select('id').single();
    if (assetResult.error) throw assetResult.error;

    if (match) {
      const { error } = await supabase.from('exercises').update({ stream_uid: uid, stream_status: status, stream_thumbnail_url: thumbnail, stream_duration_seconds: duration, stream_synced_at: new Date().toISOString(), media_url: mediaUrl, media_type: 'video' }).eq('id', match.exercise.id);
      if (error) throw error;
    }

    return NextResponse.json({ assetId: assetResult.data?.id, linked: Boolean(match), createdExercise, exerciseId: match?.exercise.id || null, status: match ? 'linked' : status });
  } catch (error) {
    return NextResponse.json({ error: 'stream_complete_failed', message: error instanceof Error ? error.message : 'Erro ao salvar vídeo no Stream.' }, { status: 500 });
  }
}
