import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle, streamHlsUrl, streamThumbnailUrl } from '@/lib/media/cloudflare-stream';
import { slugify } from '@/lib/google/drive-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cleanTitle(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '').trim();
}

async function fetchStreamVideo(uid: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const token = process.env.CLOUDFLARE_STREAM_TOKEN || '';
  if (!accountId || !token) return null;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    headers: { authorization: ['Bearer', token].join(' ') },
    cache: 'no-store',
  });
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

function score(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return Math.min(98, Math.round((Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 100) + 18);
  const aw = new Set(a.split(/\s+/).filter(Boolean));
  const bw = new Set(b.split(/\s+/).filter(Boolean));
  const common = [...aw].filter((word) => bw.has(word)).length;
  return Math.round((common / (new Set([...aw, ...bw]).size || 1)) * 100);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const formData = await request.formData();
  const moduleId = String(formData.get('module_id') || '').trim();
  const uid = String(formData.get('uid') || '').trim();
  const name = String(formData.get('name') || uid).trim();
  if (!moduleId || !uid) redirect('/admin/produtos');

  const video = await fetchStreamVideo(uid);
  const status = String(video?.status?.state || 'ready');
  const duration = Number(video?.duration || 0) || null;
  const thumbnail = String(video?.thumbnail || '') || streamThumbnailUrl(uid);
  const mediaUrl = streamHlsUrl(uid);
  const title = cleanTitle(String(video?.meta?.name || video?.name || name));
  const normalizedTitle = normalizeMediaTitle(title);

  const { data: exercises } = await supabase.from('exercises').select('id,title,slug,stream_uid').eq('module_id', moduleId).limit(1000);
  const duplicate = ((exercises || []) as any[]).find((item) => item.stream_uid === uid || normalizeMediaTitle(item.title) === normalizedTitle || normalizeMediaTitle(item.slug) === normalizedTitle);
  let exerciseId = duplicate?.id as string | undefined;
  let createdExercise = false;

  if (!exerciseId) {
    const ranked = ((exercises || []) as any[])
      .map((item) => ({ item, score: Math.max(score(normalizedTitle, normalizeMediaTitle(item.title)), score(normalizedTitle, normalizeMediaTitle(item.slug))) }))
      .sort((a, b) => b.score - a.score)[0];
    if (ranked?.score >= 90 && !ranked.item.stream_uid) exerciseId = ranked.item.id;
  }

  if (!exerciseId) {
    const { count } = await supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('module_id', moduleId);
    const slug = await uniqueExerciseSlug(supabase, moduleId, title);
    const { data, error } = await supabase.from('exercises').insert({
      module_id: moduleId,
      title,
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
    if (!error) {
      exerciseId = data.id;
      createdExercise = true;
    }
  } else {
    await supabase.from('exercises').update({ stream_uid: uid, stream_status: status, stream_thumbnail_url: thumbnail, stream_duration_seconds: duration, stream_synced_at: new Date().toISOString(), media_url: mediaUrl, media_type: 'video' }).eq('id', exerciseId);
  }

  const { data: module } = await supabase.from('modules').select('id,title').eq('id', moduleId).maybeSingle();
  const { data: courseLink } = await supabase.from('course_module_links').select('course_id').eq('module_id', moduleId).limit(1).maybeSingle();
  const { data: course } = courseLink?.course_id ? await supabase.from('courses').select('product_id').eq('id', courseLink.course_id).maybeSingle() : { data: null as any };
  const productId = course?.product_id || null;

  const payload = {
    provider: 'cloudflare_stream',
    media_type: 'video',
    product_id: productId,
    module_id: moduleId,
    exercise_id: exerciseId || null,
    title,
    normalized_title: normalizedTitle,
    stream_uid: uid,
    thumbnail_url: thumbnail,
    duration_seconds: duration,
    status: 'linked',
    raw: { stream: video, importedVia: 'stream-selector', moduleTitle: module?.title || null, createdExercise },
    updated_at: new Date().toISOString(),
  };

  const { data: existingByUid } = await supabase.from('media_assets').select('id').eq('stream_uid', uid).maybeSingle();
  if (existingByUid?.id) await supabase.from('media_assets').update(payload).eq('id', existingByUid.id);
  else await supabase.from('media_assets').insert(payload);

  if (productId) revalidatePath(`/admin/produtos/${productId}`);
  revalidatePath(`/admin/biblioteca/${moduleId}`);
  revalidatePath(`/admin/conteudos/selecionar-stream?module=${moduleId}`);
  redirect(`/admin/conteudos/selecionar-stream?module=${moduleId}&imported=1`);
}
