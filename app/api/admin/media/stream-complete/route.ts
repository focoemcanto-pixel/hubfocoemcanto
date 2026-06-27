import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle, streamHlsUrl, streamThumbnailUrl } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ExerciseRow = { id: string; title?: string | null; slug?: string | null; module_id?: string | null };
type Body = { productId?: string; moduleId?: string; title?: string; uid?: string; relativePath?: string; size?: number };

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
    const relativePath = String(body.relativePath || '').trim();
    const size = Number(body.size || 0) || null;
    if (!productId || !moduleId || !title || !uid) return NextResponse.json({ error: 'invalid_payload', message: 'Informe produto, módulo, título e UID do Stream.' }, { status: 400 });

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
      raw: { relativePath, size, matchScore: match?.score || 0, uploadedFrom: 'admin-media-uploader' },
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

    return NextResponse.json({ assetId: assetResponse.data?.id, linked: Boolean(match), exerciseId: match?.exercise.id || null, status });
  } catch (error) {
    return NextResponse.json({ error: 'stream_complete_failed', message: error instanceof Error ? error.message : 'Erro ao salvar vídeo do Stream.' }, { status: 500 });
  }
}
