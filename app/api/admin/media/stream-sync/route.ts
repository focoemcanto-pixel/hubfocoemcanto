import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle, streamHlsUrl, streamThumbnailUrl, type CloudflareStreamVideo } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ExerciseRow = { id: string; title?: string | null; slug?: string | null; module_id?: string | null };

function score(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return Math.min(98, Math.round((Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 100) + 18);
  const aw = new Set(a.split(/\s+/).filter(Boolean));
  const bw = new Set(b.split(/\s+/).filter(Boolean));
  const common = [...aw].filter((word) => bw.has(word)).length;
  return Math.round((common / (new Set([...aw, ...bw]).size || 1)) * 100);
}

function bestMatch(videoName: string, exercises: ExerciseRow[]) {
  const normalized = normalizeMediaTitle(videoName);
  const ranked = exercises.map((exercise) => ({ exercise, score: Math.max(score(normalized, normalizeMediaTitle(exercise.title)), score(normalized, normalizeMediaTitle(exercise.slug))) })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 62 ? ranked[0] : null;
}

function streamConfig() {
  return { accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '', token: process.env.CLOUDFLARE_STREAM_TOKEN || '' };
}

async function listStreamVideos() {
  const { accountId, token } = streamConfig();
  if (!accountId || !token) throw new Error('Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.');
  const videos: CloudflareStreamVideo[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?per_page=100&page=${page}`, { headers: { authorization: ['Bearer', token].join(' ') }, cache: 'no-store' });
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
    const { data, error } = await supabase.from('exercises').select('id,title,slug,module_id').eq('module_id', moduleId).limit(1200);
    if (error) throw new Error(error.message);
    return (data || []) as ExerciseRow[];
  }
  const { data: course } = await supabase.from('courses').select('id').eq('product_id', productId).order('created_at', { ascending: true }).limit(1).maybeSingle();
  let moduleIds: string[] = [];
  if (course?.id) {
    const { data: links } = await supabase.from('course_module_links').select('module_id').eq('course_id', course.id);
    moduleIds = (links || []).map((item: any) => String(item.module_id)).filter(Boolean);
  }
  let query = supabase.from('exercises').select('id,title,slug,module_id').limit(1200);
  if (moduleIds.length) query = query.in('module_id', moduleIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as ExerciseRow[];
}

export async function POST(request: Request) {
  try {
    const { productId, moduleId } = await request.json().catch(() => ({}));
    const cleanProductId = String(productId || '').trim();
    const cleanModuleId = String(moduleId || '').trim();
    if (!cleanProductId) return NextResponse.json({ error: 'missing_product_id', message: 'Informe productId.' }, { status: 400 });

    const supabase = createAdminClient();
    const [videos, exercises] = await Promise.all([listStreamVideos(), productExercises(cleanProductId, cleanModuleId || undefined)]);
    const unmatched: Array<{ uid: string; name: string; status: string; score: number }> = [];
    const errors: Array<{ uid: string; name: string; message: string }> = [];
    let linked = 0;
    let durationSeconds = 0;
    let sizeBytes = 0;

    for (const video of videos) {
      const uid = String(video.uid || '');
      const name = String((video as any).meta?.name || video.name || uid || 'Vídeo sem nome');
      const status = String(video.status?.state || 'unknown');
      const duration = Number(video.duration || 0) || null;
      const size = Number((video as any).size || 0) || 0;
      durationSeconds += duration || 0;
      sizeBytes += size;
      const thumbnail = String(video.thumbnail || '') || streamThumbnailUrl(uid);
      const match = bestMatch(name, exercises);
      const mediaUrl = streamHlsUrl(uid);
      try {
        const payload = { provider: 'cloudflare_stream', media_type: 'video', title: name, normalized_title: normalizeMediaTitle(name), product_id: cleanProductId, module_id: match?.exercise.module_id || cleanModuleId || null, exercise_id: match?.exercise.id || null, stream_uid: uid, thumbnail_url: thumbnail, duration_seconds: duration, status, raw: { stream: video, matchScore: match?.score || 0, destinationModuleId: cleanModuleId || null }, updated_at: new Date().toISOString() };
        const { data: existing } = await supabase.from('media_assets').select('id').eq('stream_uid', uid).maybeSingle();
        const assetError = existing?.id ? (await supabase.from('media_assets').update(payload).eq('id', existing.id)).error : (await supabase.from('media_assets').insert(payload)).error;
        if (assetError) throw assetError;
        if (match) {
          const { error } = await supabase.from('exercises').update({ stream_uid: uid, stream_status: status, stream_thumbnail_url: thumbnail, stream_duration_seconds: duration, stream_synced_at: new Date().toISOString(), media_url: mediaUrl, media_type: 'video' }).eq('id', match.exercise.id);
          if (error) throw error;
          linked += 1;
        } else {
          unmatched.push({ uid, name, status, score: 0 });
        }
      } catch (error) {
        errors.push({ uid, name, message: error instanceof Error ? error.message : 'Erro desconhecido' });
      }
    }

    return NextResponse.json({ total: videos.length, linked, unmatchedCount: unmatched.length, errorsCount: errors.length, durationSeconds, sizeBytes, syncedAt: new Date().toISOString(), unmatched, errors });
  } catch (error) {
    return NextResponse.json({ error: 'stream_sync_error', message: error instanceof Error ? error.message : 'Erro ao sincronizar Stream.' }, { status: 500 });
  }
}
