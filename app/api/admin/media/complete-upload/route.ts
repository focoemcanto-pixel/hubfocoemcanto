import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ExerciseRow = { id: string; title?: string | null; slug?: string | null; module_id?: string | null };
type Body = { productId?: string; moduleId?: string; title?: string; r2Url?: string; mediaType?: 'audio' | 'image' | 'file'; key?: string; relativePath?: string };

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
  return ranked[0]?.score >= 72 ? ranked[0] : null;
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
    const r2Url = String(body.r2Url || '').trim();
    const mediaType = String(body.mediaType || '') as 'audio' | 'image' | 'file';
    if (!productId || !moduleId || !title || !r2Url || !['audio', 'image', 'file'].includes(mediaType)) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

    const supabase = createAdminClient();
    const { data: exercises, error: exercisesError } = await supabase.from('exercises').select('id,title,slug,module_id').eq('module_id', moduleId).limit(800);
    if (exercisesError) throw exercisesError;
    const match = bestMatch(title, (exercises || []) as ExerciseRow[]);
    const status = match ? 'linked' : 'uploaded';
    const payload = {
      provider: 'cloudflare_r2',
      media_type: mediaType,
      product_id: productId,
      module_id: moduleId,
      exercise_id: match?.exercise.id || null,
      title,
      normalized_title: normalizeMediaTitle(title),
      r2_url: r2Url,
      status,
      raw: { r2Key: body.key || null, relativePath: body.relativePath || '', matchScore: match?.score || 0 },
      updated_at: new Date().toISOString(),
    };
    const { data: asset, error: assetError } = await supabase.from('media_assets').insert(payload).select('id').single();
    if (assetError) throw assetError;

    if (match && mediaType === 'audio') {
      const { error } = await supabase.from('exercises').update({ media_url: r2Url, media_type: 'audio' }).eq('id', match.exercise.id);
      if (error) throw error;
    }

    return NextResponse.json({ assetId: asset?.id, linked: Boolean(match), exerciseId: match?.exercise.id || null, status });
  } catch (error) {
    return NextResponse.json({ error: 'complete_upload_failed', message: error instanceof Error ? error.message : 'Erro ao salvar mídia.' }, { status: 500 });
  }
}
