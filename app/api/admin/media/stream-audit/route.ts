import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle, streamHlsUrl, streamThumbnailUrl, type CloudflareStreamVideo } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ExerciseRow = { id: string; title?: string | null; slug?: string | null; module_id?: string | null; stream_uid?: string | null; media_url?: string | null };

type Body = {
  productId?: string;
  moduleId?: string;
  action?: 'audit' | 'link' | 'delete';
  uid?: string;
  exerciseId?: string;
};

function streamConfig() {
  return { accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '', token: process.env.CLOUDFLARE_STREAM_TOKEN || '' };
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

function bestVideoMatch(lesson: ExerciseRow, videos: CloudflareStreamVideo[], linkedUids: Set<string>) {
  const lessonText = normalizeMediaTitle(`${lesson.title || ''} ${lesson.slug || ''}`);
  const ranked = videos
    .filter((video) => video.uid && !linkedUids.has(String(video.uid)))
    .map((video) => {
      const name = String((video as any).meta?.name || video.name || video.uid || '');
      return { uid: String(video.uid), name, score: score(lessonText, normalizeMediaTitle(name)) };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 62 ? ranked[0] : null;
}

async function listStreamVideos() {
  const { accountId, token } = streamConfig();
  if (!accountId || !token) throw new Error('Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.');
  const videos: CloudflareStreamVideo[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?per_page=100&page=${page}`, {
      headers: { authorization: ['Bearer', token].join(' ') },
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) throw new Error(json?.errors?.[0]?.message || `Cloudflare Stream respondeu ${response.status}.`);
    const batch = Array.isArray(json?.result) ? json.result : [];
    videos.push(...batch);
    const info = json?.result_info;
    if (!batch.length || (info?.total_pages && page >= Number(info.total_pages))) break;
  }
  return videos;
}

async function productExercises(productId: string, moduleId?: string) {
  const supabase = createAdminClient();
  if (moduleId) {
    const { data, error } = await supabase.from('exercises').select('id,title,slug,module_id,stream_uid,media_url').eq('module_id', moduleId).limit(1500);
    if (error) throw error;
    return (data || []) as ExerciseRow[];
  }
  const { data: course } = await supabase.from('courses').select('id').eq('product_id', productId).order('created_at', { ascending: true }).limit(1).maybeSingle();
  let moduleIds: string[] = [];
  if (course?.id) {
    const { data: links } = await supabase.from('course_module_links').select('module_id').eq('course_id', course.id);
    moduleIds = (links || []).map((item: any) => String(item.module_id)).filter(Boolean);
  }
  let query = supabase.from('exercises').select('id,title,slug,module_id,stream_uid,media_url').limit(1500);
  if (moduleIds.length) query = query.in('module_id', moduleIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ExerciseRow[];
}

async function deleteStreamVideo(uid: string) {
  const { accountId, token } = streamConfig();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    method: 'DELETE',
    headers: { authorization: ['Bearer', token].join(' ') },
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) throw new Error(json?.errors?.[0]?.message || `Cloudflare Stream respondeu ${response.status}.`);
}

async function linkVideo(productId: string, moduleId: string, uid: string, exerciseId: string) {
  const supabase = createAdminClient();
  const [videos, { data: exercise }] = await Promise.all([
    listStreamVideos(),
    supabase.from('exercises').select('id,title,slug,module_id').eq('id', exerciseId).maybeSingle(),
  ]);
  const video = videos.find((item) => String(item.uid || '') === uid);
  if (!video || !exercise?.id) throw new Error('Vídeo ou aula não encontrado.');
  const name = String((video as any).meta?.name || video.name || uid || 'Vídeo sem nome');
  const status = String(video.status?.state || 'unknown');
  const duration = Number(video.duration || 0) || null;
  const thumbnail = String(video.thumbnail || '') || streamThumbnailUrl(uid);
  const mediaUrl = streamHlsUrl(uid);
  const targetModuleId = String(exercise.module_id || moduleId || '');
  const payload = {
    provider: 'cloudflare_stream',
    media_type: 'video',
    title: name,
    normalized_title: normalizeMediaTitle(name),
    product_id: productId,
    module_id: targetModuleId || null,
    exercise_id: exercise.id,
    stream_uid: uid,
    thumbnail_url: thumbnail,
    duration_seconds: duration,
    status,
    raw: { stream: video, manualLink: true, source: 'stream-audit' },
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase.from('media_assets').select('id').eq('stream_uid', uid).maybeSingle();
  const assetError = existing?.id ? (await supabase.from('media_assets').update(payload).eq('id', existing.id)).error : (await supabase.from('media_assets').insert(payload)).error;
  if (assetError) throw assetError;
  const { error } = await supabase.from('exercises').update({ stream_uid: uid, stream_status: status, stream_thumbnail_url: thumbnail, stream_duration_seconds: duration, stream_synced_at: new Date().toISOString(), media_url: mediaUrl, media_type: 'video' }).eq('id', exercise.id);
  if (error) throw error;
}

async function audit(productId: string, moduleId?: string) {
  const supabase = createAdminClient();
  const [videos, exercises, { data: assets }] = await Promise.all([
    listStreamVideos(),
    productExercises(productId, moduleId),
    supabase.from('media_assets').select('stream_uid,exercise_id,title').eq('provider', 'cloudflare_stream').not('stream_uid', 'is', null).limit(5000),
  ]);
  const exerciseLinkedUids = new Set(exercises.map((exercise) => String(exercise.stream_uid || '')).filter(Boolean));
  const assetLinkedUids = new Set((assets || []).filter((asset: any) => asset.exercise_id).map((asset: any) => String(asset.stream_uid || '')).filter(Boolean));
  const linkedUids = new Set([...exerciseLinkedUids, ...assetLinkedUids]);
  const missingLessons = exercises
    .filter((exercise) => !String(exercise.stream_uid || '').trim())
    .map((exercise) => ({
      id: exercise.id,
      title: exercise.title || exercise.slug || 'Aula sem título',
      moduleId: exercise.module_id,
      suggestedVideo: bestVideoMatch(exercise, videos, linkedUids),
    }));
  const orphanVideos = videos
    .filter((video) => video.uid && !linkedUids.has(String(video.uid)))
    .map((video) => ({
      uid: String(video.uid),
      name: String((video as any).meta?.name || video.name || video.uid || 'Vídeo sem nome'),
      status: String(video.status?.state || 'unknown'),
      duration: Number(video.duration || 0) || null,
      thumbnail: String(video.thumbnail || '') || streamThumbnailUrl(String(video.uid)),
    }));
  return { totalVideos: videos.length, totalLessons: exercises.length, linkedCount: linkedUids.size, missingLessons, orphanVideos, checkedAt: new Date().toISOString() };
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as Body;
    const productId = String(body.productId || '').trim();
    const moduleId = String(body.moduleId || '').trim();
    const uid = String(body.uid || '').trim();
    const exerciseId = String(body.exerciseId || '').trim();
    const action = body.action || 'audit';
    if (!productId) return NextResponse.json({ error: 'missing_product_id', message: 'Informe productId.' }, { status: 400 });

    if (action === 'link') {
      if (!uid || !exerciseId) return NextResponse.json({ error: 'missing_link_data', message: 'Informe vídeo e aula.' }, { status: 400 });
      await linkVideo(productId, moduleId, uid, exerciseId);
      return NextResponse.json({ ok: true, ...(await audit(productId, moduleId || undefined)) });
    }

    if (action === 'delete') {
      if (!uid) return NextResponse.json({ error: 'missing_uid', message: 'Informe o UID.' }, { status: 400 });
      await deleteStreamVideo(uid);
      const supabase = createAdminClient();
      await supabase.from('media_assets').delete().eq('stream_uid', uid).is('exercise_id', null);
      return NextResponse.json({ ok: true, ...(await audit(productId, moduleId || undefined)) });
    }

    return NextResponse.json(await audit(productId, moduleId || undefined));
  } catch (error) {
    return NextResponse.json({ error: 'stream_audit_error', message: error instanceof Error ? error.message : 'Erro ao auditar Stream.' }, { status: 500 });
  }
}
