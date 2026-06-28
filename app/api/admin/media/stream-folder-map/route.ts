import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  productId?: string;
  moduleId?: string;
  files?: Array<{ name?: string; relativePath?: string; size?: number; type?: string }>;
  createMissing?: boolean;
};

type ExerciseRow = {
  id: string;
  title?: string | null;
  slug?: string | null;
  stream_uid?: string | null;
  media_url?: string | null;
};

function cleanTitle(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '').trim();
}

function isVideo(fileName: string, contentType = '') {
  return contentType.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(fileName);
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

function bestMatch(fileName: string, exercises: ExerciseRow[]) {
  const normalized = normalizeMediaTitle(cleanTitle(fileName));
  const exact = exercises.find((exercise) => normalizeMediaTitle(exercise.title) === normalized || normalizeMediaTitle(exercise.slug) === normalized);
  if (exact) return { exercise: exact, score: 100, exact: true };
  const ranked = exercises
    .map((exercise) => ({
      exercise,
      score: Math.max(score(normalized, normalizeMediaTitle(exercise.title)), score(normalized, normalizeMediaTitle(exercise.slug))),
      exact: false,
    }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 62 ? ranked[0] : null;
}

async function streamUidExists(uid: string, cache: Map<string, boolean>) {
  if (!uid) return false;
  if (cache.has(uid)) return Boolean(cache.get(uid));
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const token = process.env.CLOUDFLARE_STREAM_TOKEN || process.env['CLOUDFLARE_' + 'STREAM_' + 'TOKEN'] || '';
  if (!accountId || !token) return false;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    headers: { authorization: ['Bearer', token].join(' ') },
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  const exists = response.ok && json?.success !== false && Boolean(json?.result?.uid || json?.result?.created);
  cache.set(uid, exists);
  return exists;
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as Body;
    const productId = String(body.productId || '').trim();
    const moduleId = String(body.moduleId || '').trim();
    const createMissing = body.createMissing !== false;
    const files = Array.isArray(body.files) ? body.files : [];

    if (!productId || !moduleId) return NextResponse.json({ error: 'missing_destination', message: 'Informe produto e módulo.' }, { status: 400 });
    if (!files.length) return NextResponse.json({ error: 'empty_files', message: 'Selecione uma pasta ou vídeos para mapear.' }, { status: 400 });

    const supabase = createAdminClient();
    const [{ data: product }, { data: module }, { data: exercises, error: exercisesError }] = await Promise.all([
      supabase.from('products').select('id,name').eq('id', productId).maybeSingle(),
      supabase.from('modules').select('id,title').eq('id', moduleId).maybeSingle(),
      supabase.from('exercises').select('id,title,slug,stream_uid,media_url').eq('module_id', moduleId).limit(5000),
    ]);

    if (!product?.id || !module?.id) return NextResponse.json({ error: 'invalid_destination', message: 'Produto ou módulo inválido.' }, { status: 400 });
    if (exercisesError) throw exercisesError;

    const rows = (exercises || []) as ExerciseRow[];
    const uidCache = new Map<string, boolean>();
    const mapped = [] as Array<{
      fileName: string;
      relativePath: string;
      size: number;
      normalizedTitle: string;
      action: 'skip_valid_stream' | 'upload_missing_stream' | 'upload_broken_stream' | 'upload_new_lesson' | 'skip_no_lesson';
      reason: string;
      exerciseId?: string | null;
      exerciseTitle?: string | null;
      streamUid?: string | null;
      streamValid?: boolean;
      score?: number;
    }>;

    for (const file of files) {
      const fileName = String(file.name || '').trim();
      const relativePath = String(file.relativePath || fileName).trim();
      const size = Number(file.size || 0) || 0;
      const type = String(file.type || '').trim();
      if (!fileName || !isVideo(fileName, type)) continue;

      const normalizedTitle = normalizeMediaTitle(cleanTitle(fileName));
      const match = bestMatch(fileName, rows);
      const exercise = match?.exercise || null;
      const uid = String(exercise?.stream_uid || '').trim();
      const streamValid = uid ? await streamUidExists(uid, uidCache) : false;

      if (exercise?.id && uid && streamValid) {
        mapped.push({ fileName, relativePath, size, normalizedTitle, action: 'skip_valid_stream', reason: 'Aula já possui Stream válido.', exerciseId: exercise.id, exerciseTitle: exercise.title || '', streamUid: uid, streamValid: true, score: match?.score || 0 });
      } else if (exercise?.id && uid && !streamValid) {
        mapped.push({ fileName, relativePath, size, normalizedTitle, action: 'upload_broken_stream', reason: 'Aula possui UID, mas ele não existe mais no Cloudflare Stream.', exerciseId: exercise.id, exerciseTitle: exercise.title || '', streamUid: uid, streamValid: false, score: match?.score || 0 });
      } else if (exercise?.id) {
        mapped.push({ fileName, relativePath, size, normalizedTitle, action: 'upload_missing_stream', reason: 'Aula existe, mas ainda não tem Stream.', exerciseId: exercise.id, exerciseTitle: exercise.title || '', streamUid: uid || null, streamValid: false, score: match?.score || 0 });
      } else if (createMissing) {
        mapped.push({ fileName, relativePath, size, normalizedTitle, action: 'upload_new_lesson', reason: 'Arquivo sem aula correspondente. Será enviado e poderá criar aula.', streamValid: false, score: match?.score || 0 });
      } else {
        mapped.push({ fileName, relativePath, size, normalizedTitle, action: 'skip_no_lesson', reason: 'Arquivo sem aula correspondente e criação de aulas desativada.', streamValid: false, score: match?.score || 0 });
      }
    }

    const uploadActions = new Set(['upload_missing_stream', 'upload_broken_stream', 'upload_new_lesson']);
    const upload = mapped.filter((item) => uploadActions.has(item.action));
    const skipped = mapped.filter((item) => !uploadActions.has(item.action));

    return NextResponse.json({
      productId,
      moduleId,
      productName: product.name || '',
      moduleTitle: module.title || '',
      totalFiles: mapped.length,
      uploadCount: upload.length,
      skipCount: skipped.length,
      validStreamCount: mapped.filter((item) => item.action === 'skip_valid_stream').length,
      brokenStreamCount: mapped.filter((item) => item.action === 'upload_broken_stream').length,
      missingStreamCount: mapped.filter((item) => item.action === 'upload_missing_stream').length,
      newLessonCount: mapped.filter((item) => item.action === 'upload_new_lesson').length,
      mapped,
    });
  } catch (error) {
    return NextResponse.json({ error: 'stream_folder_map_failed', message: error instanceof Error ? error.message : 'Erro ao mapear pasta.' }, { status: 500 });
  }
}
