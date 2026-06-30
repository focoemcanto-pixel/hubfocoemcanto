import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle, streamHlsUrl, streamThumbnailUrl } from '@/lib/media/cloudflare-stream';
import { slugify } from '@/lib/google/drive-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cleanTitle(fileName: string) { return fileName.replace(/\.[^/.]+$/, '').trim(); }
function score(a: string, b: string) { if (!a || !b) return 0; if (a === b) return 100; if (a.includes(b) || b.includes(a)) return Math.min(98, Math.round((Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 100) + 18); const aw = new Set(a.split(/\s+/).filter(Boolean)); const bw = new Set(b.split(/\s+/).filter(Boolean)); const common = [...aw].filter((word) => bw.has(word)).length; return Math.round((common / (new Set([...aw, ...bw]).size || 1)) * 100); }

async function fetchStreamVideo(uid: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const token = process.env.CLOUDFLARE_STREAM_TOKEN || '';
  if (!accountId || !token) return null;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, { headers: { authorization: ['Bearer', token].join(' ') }, cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) return null;
  return json?.result || null;
}

async function uniqueSlug(supabase: ReturnType<typeof createAdminClient>, moduleId: string, title: string) {
  const base = slugify(cleanTitle(title)) || `aula-${Date.now().toString(36)}`;
  for (let i = 0; i < 50; i += 1) {
    const candidate = i ? `${base}-${i + 1}` : base;
    const { data } = await supabase.from('exercises').select('id').eq('module_id', moduleId).eq('slug', candidate).maybeSingle();
    if (!data?.id) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function importOne(supabase: ReturnType<typeof createAdminClient>, moduleId: string, productId: string, uid: string, fallbackName: string) {
  const video = await fetchStreamVideo(uid);
  const title = cleanTitle(String(video?.meta?.name || video?.name || fallbackName || uid));
  const normalized = normalizeMediaTitle(title);
  const status = String(video?.status?.state || 'ready');
  const duration = Number(video?.duration || 0) || null;
  const thumbnail = String(video?.thumbnail || '') || streamThumbnailUrl(uid);
  const mediaUrl = streamHlsUrl(uid);

  const { data: exercises } = await supabase.from('exercises').select('id,title,slug,stream_uid').eq('module_id', moduleId).limit(1000);
  const rows = (exercises || []) as any[];
  const duplicate = rows.find((item) => item.stream_uid === uid || normalizeMediaTitle(item.title) === normalized || normalizeMediaTitle(item.slug) === normalized);
  let exerciseId = duplicate?.id as string | undefined;
  let createdExercise = false;

  if (!exerciseId) {
    const ranked = rows.map((item) => ({ item, score: Math.max(score(normalized, normalizeMediaTitle(item.title)), score(normalized, normalizeMediaTitle(item.slug))) })).sort((a, b) => b.score - a.score)[0];
    if (ranked?.score >= 90 && !ranked.item.stream_uid) exerciseId = ranked.item.id;
  }

  if (!exerciseId) {
    const { count } = await supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('module_id', moduleId);
    const slug = await uniqueSlug(supabase, moduleId, title);
    const { data, error } = await supabase.from('exercises').insert({ module_id: moduleId, title, slug, description: '', objective: 'Assista, pratique e envie sua resposta para avaliação.', media_type: 'video', difficulty: 1, media_url: mediaUrl, stream_uid: uid, stream_status: status, stream_thumbnail_url: thumbnail, stream_duration_seconds: duration, stream_synced_at: new Date().toISOString(), is_active: true, sort_order: (count || 0) + 1 }).select('id').single();
    if (error) throw error;
    exerciseId = data.id;
    createdExercise = true;
  } else {
    await supabase.from('exercises').update({ stream_uid: uid, stream_status: status, stream_thumbnail_url: thumbnail, stream_duration_seconds: duration, stream_synced_at: new Date().toISOString(), media_url: mediaUrl, media_type: 'video' }).eq('id', exerciseId);
  }

  const assetPayload = { provider: 'cloudflare_stream', media_type: 'video', product_id: productId || null, module_id: moduleId, exercise_id: exerciseId || null, title, normalized_title: normalized, stream_uid: uid, thumbnail_url: thumbnail, duration_seconds: duration, status: 'linked', raw: { stream: video, importedVia: 'stream-selector', createdExercise }, updated_at: new Date().toISOString() };
  const { data: existing } = await supabase.from('media_assets').select('id').eq('stream_uid', uid).maybeSingle();
  if (existing?.id) await supabase.from('media_assets').update(assetPayload).eq('id', existing.id);
  else await supabase.from('media_assets').insert(assetPayload);
  return { uid, createdExercise };
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const formData = await request.formData();
  const moduleId = String(formData.get('module_id') || '').trim();
  const productId = String(formData.get('product_id') || '').trim();
  const uids = formData.getAll('uid').map((value) => String(value || '').trim()).filter(Boolean);
  if (!moduleId || !uids.length) redirect('/admin/produtos');

  let imported = 0;
  for (const uid of Array.from(new Set(uids))) {
    const fallbackName = String(formData.get(`name_${uid}`) || formData.get('name') || uid).trim();
    try {
      await importOne(supabase, moduleId, productId, uid, fallbackName);
      imported += 1;
    } catch {
      // Mantém a importação em massa seguindo mesmo se um vídeo falhar.
    }
  }

  if (productId) revalidatePath(`/admin/produtos/${productId}`);
  revalidatePath(`/admin/conteudos/selecionar-stream?module=${moduleId}`);
  redirect(`/admin/conteudos/selecionar-stream?module=${moduleId}&imported=${imported}`);
}
