import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ExerciseRow = { id: string; title?: string | null; slug?: string | null; module_id?: string | null; stream_uid?: string | null; media_url?: string | null };

type StreamVideo = {
  uid?: string;
  name?: string;
  duration?: number;
  thumbnail?: string;
  status?: { state?: string };
  meta?: Record<string, unknown>;
};

function streamConfig() {
  return { accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '', token: process.env.CLOUDFLARE_STREAM_TOKEN || '' };
}

async function listStreamVideos() {
  const { accountId, token } = streamConfig();
  if (!accountId || !token) throw new Error('Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.');
  const videos: StreamVideo[] = [];
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

function videoName(video: StreamVideo) {
  return String(video.meta?.name || video.name || video.uid || 'Vídeo sem nome');
}

function isValidStreamVideo(video?: StreamVideo) {
  if (!video?.uid) return false;
  const state = String(video.status?.state || 'unknown');
  const duration = Number(video.duration || 0) || 0;
  return state === 'ready' && duration > 0;
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const productId = String(body.productId || '').trim();
    const moduleId = String(body.moduleId || '').trim();
    const deleteLessonIds = Array.isArray(body.deleteLessonIds) ? body.deleteLessonIds.map((id: unknown) => String(id || '').trim()).filter(Boolean) : [];
    if (!productId || !moduleId) return NextResponse.json({ error: 'missing_destination', message: 'Informe produto e módulo.' }, { status: 400 });

    const supabase = createAdminClient();
    const videos = await listStreamVideos();
    const streamByUid = new Map(videos.map((video) => [String(video.uid || '').trim(), video]).filter(([uid]) => Boolean(uid)) as Array<[string, StreamVideo]>);

    if (deleteLessonIds.length) {
      const { data: safeLessons, error: safeError } = await supabase
        .from('exercises')
        .select('id,stream_uid')
        .eq('module_id', moduleId)
        .in('id', deleteLessonIds);
      if (safeError) throw safeError;
      const ids = (safeLessons || [])
        .filter((lesson: any) => !isValidStreamVideo(streamByUid.get(String(lesson.stream_uid || '').trim())))
        .map((lesson: any) => lesson.id);
      if (ids.length) {
        await supabase.from('community_posts').delete().in('exercise_id', ids);
        await supabase.from('submissions').delete().in('exercise_id', ids);
        await supabase.from('media_assets').update({ exercise_id: null }).in('exercise_id', ids);
        await supabase.from('exercises').delete().in('id', ids);
      }
      return NextResponse.json({ deleted: ids.length, skipped: deleteLessonIds.length - ids.length });
    }

    const { data: exercises, error: exercisesError } = await supabase
      .from('exercises')
      .select('id,title,slug,module_id,stream_uid,media_url')
      .eq('module_id', moduleId)
      .order('sort_order', { ascending: true });
    if (exercisesError) throw exercisesError;

    const lessonRows = (exercises || []) as ExerciseRow[];
    const validLinkedLessons = lessonRows.filter((lesson) => isValidStreamVideo(streamByUid.get(String(lesson.stream_uid || '').trim())));
    const brokenLessons = lessonRows
      .filter((lesson) => String(lesson.stream_uid || '').trim() && !isValidStreamVideo(streamByUid.get(String(lesson.stream_uid || '').trim())))
      .map((lesson) => ({ id: lesson.id, title: lesson.title || lesson.slug || lesson.id, slug: lesson.slug || null, streamUid: lesson.stream_uid || null, reason: streamByUid.has(String(lesson.stream_uid || '').trim()) ? 'UID existe, mas não está pronto/sem duração válida.' : 'UID apagado ou inexistente no Cloudflare Stream.' }));
    const missingLessons = lessonRows
      .filter((lesson) => !String(lesson.stream_uid || '').trim())
      .map((lesson) => ({ id: lesson.id, title: lesson.title || lesson.slug || lesson.id, slug: lesson.slug || null, reason: 'Aula sem UID Stream.' }));
    const actionableLessons = [...brokenLessons, ...missingLessons];
    const validUsedUids = new Set(validLinkedLessons.map((lesson) => String(lesson.stream_uid || '').trim()).filter(Boolean));
    const availableVideos = videos
      .filter((video) => isValidStreamVideo(video) && video.uid && !validUsedUids.has(String(video.uid)))
      .map((video) => ({ uid: String(video.uid), name: videoName(video), status: String(video.status?.state || 'unknown'), duration: Number(video.duration || 0) || null, thumbnail: String(video.thumbnail || '') }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      totalLessons: lessonRows.length,
      linkedLessons: validLinkedLessons.length,
      missingCount: actionableLessons.length,
      brokenCount: brokenLessons.length,
      emptyCount: missingLessons.length,
      availableCount: availableVideos.length,
      missingLessons: actionableLessons,
      availableVideos,
      mappedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: 'content_stream_map_error', message: error instanceof Error ? error.message : 'Erro ao mapear Stream do módulo.' }, { status: 500 });
  }
}
