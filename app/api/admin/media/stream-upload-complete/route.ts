import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle, streamHlsUrl, streamThumbnailUrl } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ExerciseRow = {
  id: string;
  title?: string | null;
  slug?: string | null;
  module_id?: string | null;
  modules?: { title?: string | null } | { title?: string | null }[] | null;
};

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return Math.min(96, Math.round((Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 100) + 18);
  const aw = new Set(a.split(/\s+/).filter(Boolean));
  const bw = new Set(b.split(/\s+/).filter(Boolean));
  const common = [...aw].filter((item) => bw.has(item)).length;
  const total = new Set([...aw, ...bw]).size || 1;
  return Math.round((common / total) * 100);
}

async function findBestExercise(productId: string | null, fileName: string) {
  const supabase = createAdminClient();
  const normalized = normalizeMediaTitle(fileName);

  let moduleIds: string[] = [];
  if (productId) {
    const { data: course } = await supabase.from('courses').select('id').eq('product_id', productId).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (course?.id) {
      const { data: links } = await supabase.from('course_module_links').select('module_id').eq('course_id', course.id);
      moduleIds = (links || []).map((item: any) => String(item.module_id)).filter(Boolean);
    }
  }

  let query = supabase.from('exercises').select('id,title,slug,module_id,modules(title)').limit(800);
  if (moduleIds.length) query = query.in('module_id', moduleIds);
  const { data } = await query;
  const candidates = ((data || []) as ExerciseRow[]).map((exercise) => {
    const score = Math.max(similarity(normalized, normalizeMediaTitle(exercise.title)), similarity(normalized, normalizeMediaTitle(exercise.slug)));
    return { exercise, score };
  }).sort((a, b) => b.score - a.score);

  const best = candidates[0];
  return best && best.score >= 62 ? best : null;
}

function cloudflareConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '';
  const token = process.env.CLOUDFLARE_STREAM_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '';
  return { accountId, token };
}

async function fetchStreamVideo(uid: string) {
  const { accountId, token } = cloudflareConfig();
  if (!accountId || !token) return null;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const json = await response.json().catch(() => null);
  return response.ok && json?.success ? json.result : null;
}

async function saveMediaAsset(payload: Record<string, unknown>) {
  const supabase = createAdminClient();
  const streamUid = String(payload.stream_uid || '');
  if (!streamUid) return;

  const { data: existing } = await supabase.from('media_assets').select('id').eq('stream_uid', streamUid).maybeSingle();
  if (existing?.id) {
    await supabase.from('media_assets').update(payload).eq('id', existing.id);
    return;
  }
  await supabase.from('media_assets').insert(payload);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const uid = String(body.uid || '').trim();
    const fileName = String(body.fileName || '').trim();
    const productId = String(body.productId || '').trim() || null;
    const relativePath = String(body.relativePath || fileName).trim();

    if (!uid || !fileName) return NextResponse.json({ error: 'missing_uid_or_file_name' }, { status: 400 });

    const supabase = createAdminClient();
    const video = await fetchStreamVideo(uid);
    const status = String(video?.status?.state || 'uploaded');
    const duration = Number(video?.duration || 0) || null;
    const thumbnail = String(video?.thumbnail || '') || streamThumbnailUrl(uid);
    const match = await findBestExercise(productId, fileName);
    const exerciseId = match?.exercise.id || null;
    const moduleId = match?.exercise.module_id || null;
    const mediaUrl = streamHlsUrl(uid);

    await saveMediaAsset({
      provider: 'cloudflare_stream',
      media_type: 'video',
      title: fileName,
      normalized_title: normalizeMediaTitle(fileName),
      product_id: productId,
      module_id: moduleId,
      exercise_id: exerciseId,
      stream_uid: uid,
      thumbnail_url: thumbnail,
      duration_seconds: duration,
      status,
      raw: { fileName, relativePath, matchScore: match?.score || 0, stream: video || null },
      updated_at: new Date().toISOString(),
    });

    if (exerciseId) {
      await supabase.from('exercises').update({
        stream_uid: uid,
        stream_status: status,
        stream_thumbnail_url: thumbnail,
        stream_duration_seconds: duration,
        stream_synced_at: new Date().toISOString(),
        media_url: mediaUrl,
        media_type: 'video',
      }).eq('id', exerciseId);
    }

    return NextResponse.json({ uid, status, thumbnail, duration, mediaUrl, matched: Boolean(exerciseId), exerciseId, matchScore: match?.score || 0, exerciseTitle: match?.exercise.title || null });
  } catch (error) {
    return NextResponse.json({ error: 'stream_upload_complete_error', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
