import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

const BUCKET = 'submission-media';
let bucketReady = false;
const SYSTEM_DUET_CAPTIONS = new Set(['minha prática do dueto.', 'minha pratica do dueto.', 'compartilhou uma prática.', 'compartilhou uma pratica.', 'prática vocal.', 'pratica vocal.', 'novo dueto.']);

type ResolvedSubmissionContext = { exercise: { id: string }; profile: { id: string; email?: string | null }; canRequestReview: boolean };
type PersistSubmissionParams = { caption: string; visibility: string; reviewRequested: boolean; fileUrl: string; posterUrl?: string | null };

function normalizeCaption(value: unknown) {
  const text = String(value || '').trim();
  return SYSTEM_DUET_CAPTIONS.has(text.toLowerCase()) ? '' : text;
}
function pathPart(value: string) { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-'); }
function parseBoolean(value: unknown, fallback = true) { if (value === undefined || value === null || value === '') return fallback; return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()); }
function hasVipSubscription(rows: any[]) { return rows.some((sub) => sub.course_key === 'grupo-vip' && isAccessActive(sub.status)); }
function isMissingColumn(error: any) { const text = String(error?.message || '').toLowerCase(); return text.includes('poster_url') || text.includes('schema cache') || text.includes('column'); }

async function uploadSubmissionFile(supabase: ReturnType<typeof createAdminClient>, objectPath: string, bytes: ArrayBuffer, fileType: string) {
  const firstUpload = await supabase.storage.from(BUCKET).upload(objectPath, bytes, { contentType: fileType, upsert: true });
  if (!firstUpload.error) { bucketReady = true; return firstUpload; }
  if (bucketReady) return firstUpload;
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => null);
  const retryUpload = await supabase.storage.from(BUCKET).upload(objectPath, bytes, { contentType: fileType, upsert: true });
  if (!retryUpload.error) bucketReady = true;
  return retryUpload;
}

async function resolveExerciseAndProfile(supabase: ReturnType<typeof createAdminClient>, lessonSlug: string, email: string) {
  const [{ data: exercise, error: exerciseError }, { data: profile, error: profileQueryError }] = await Promise.all([
    supabase.from('exercises').select('id').eq('slug', lessonSlug).maybeSingle(),
    supabase.from('profiles').select('id,email').eq('email', email).maybeSingle(),
  ]);
  if (exerciseError) return { error: NextResponse.json({ error: 'exercise_query_failed', detail: exerciseError.message }, { status: 500 }) };
  if (!exercise?.id) return { error: NextResponse.json({ error: 'exercise_not_found' }, { status: 404 }) };
  if (profileQueryError) return { error: NextResponse.json({ error: 'profile_query_failed', detail: profileQueryError.message }, { status: 500 }) };
  let currentProfile = profile;
  if (!currentProfile?.id) {
    const { data: created, error: profileError } = await supabase.from('profiles').insert({ email, name: email.split('@')[0], role: 'student' }).select('id,email').single();
    if (profileError || !created) return { error: NextResponse.json({ error: 'profile_failed', detail: profileError?.message }, { status: 500 }) };
    currentProfile = created;
  }
  const { data: subscriptions } = await supabase.from('subscriptions').select('course_key,status').eq('profile_id', currentProfile.id);
  return { exercise, profile: currentProfile, canRequestReview: hasVipSubscription(subscriptions || []) };
}

async function insertCommunityPost(supabase: ReturnType<typeof createAdminClient>, payload: Record<string, any>) {
  const withPoster = await supabase.from('community_posts').insert(payload).select('id').single();
  if (!withPoster.error || !payload.poster_url || !isMissingColumn(withPoster.error)) return withPoster;
  const { poster_url: _posterUrl, ...fallbackPayload } = payload;
  return supabase.from('community_posts').insert(fallbackPayload).select('id').single();
}

async function persistSubmission(supabase: ReturnType<typeof createAdminClient>, context: ResolvedSubmissionContext, params: PersistSubmissionParams) {
  const shouldPostCommunity = params.visibility === 'community';
  const shouldReview = context.canRequestReview && params.reviewRequested;
  const cleanCaption = normalizeCaption(params.caption);
  if (params.reviewRequested && !context.canRequestReview) {
    if (!shouldPostCommunity) return NextResponse.json({ error: 'vip_required', detail: 'Avaliação do professor é exclusiva para assinantes VIP.' }, { status: 403 });
  }
  if (!shouldPostCommunity && !shouldReview) return NextResponse.json({ error: 'missing_destination', detail: 'Escolha postar na comunidade ou envie para avaliação sendo assinante VIP.' }, { status: 400 });
  let submissionId: string | null = null;
  let communityPostId: string | null = null;
  if (shouldReview) {
    const { data: submission, error: submissionError } = await supabase.from('submissions').insert({ profile_id: context.profile.id, exercise_id: context.exercise.id, file_url: params.fileUrl, file_type: 'duet_video', note: cleanCaption || null, visibility: shouldPostCommunity ? 'community' : 'private', status: 'pending_review' }).select('id').single();
    if (submissionError || !submission) return NextResponse.json({ error: 'submission_failed', detail: submissionError?.message }, { status: 500 });
    submissionId = submission.id;
  }
  if (shouldPostCommunity) {
    const { data: post, error: postError } = await insertCommunityPost(supabase, { profile_id: context.profile.id, exercise_id: context.exercise.id, submission_id: submissionId, media_url: params.fileUrl, poster_url: params.posterUrl || null, caption: cleanCaption || null, category: 'dueto' });
    if (postError) return NextResponse.json({ error: 'community_post_failed', detail: postError.message }, { status: 500 });
    communityPostId = post?.id || null;
  }
  return NextResponse.json({ ok: true, id: submissionId, community_post_id: communityPostId, posted: shouldPostCommunity, review_requested: shouldReview });
}

async function saveSubmission(params: { lessonSlug: string; caption: string; visibility: string; reviewRequested: boolean; fileUrl: string; posterUrl?: string | null }) {
  const email = (await cookies()).get('hub_access_email')?.value || '';
  if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  if (!params.lessonSlug || !params.fileUrl) return NextResponse.json({ error: 'missing_payload' }, { status: 400 });
  const supabase = createAdminClient();
  const resolved = await resolveExerciseAndProfile(supabase, params.lessonSlug, email);
  if ('error' in resolved) return resolved.error;
  return persistSubmission(supabase, resolved, params);
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      return saveSubmission({ lessonSlug: String(body.lesson_slug || ''), caption: normalizeCaption(body.caption), visibility: String(body.visibility || 'private'), reviewRequested: parseBoolean(body.review_requested, true), fileUrl: String(body.file_url || '').trim(), posterUrl: String(body.poster_url || '').trim() || null });
    }
    const [form, cookieStore] = await Promise.all([request.formData(), cookies()]);
    const file = form.get('file');
    const poster = form.get('poster');
    const lessonSlug = String(form.get('lesson_slug') || '');
    const caption = normalizeCaption(form.get('caption'));
    const visibility = String(form.get('visibility') || 'private');
    const reviewRequested = parseBoolean(form.get('review_requested'), true);
    const email = cookieStore.get('hub_access_email')?.value || '';
    if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    if (!(file instanceof File) || !lessonSlug) return NextResponse.json({ error: 'missing_payload' }, { status: 400 });
    if (file.size < 1000) return NextResponse.json({ error: 'empty_media_file', detail: 'O vídeo final ficou vazio. Renderize novamente antes de publicar.' }, { status: 400 });
    const supabase = createAdminClient();
    const [resolved, bytes] = await Promise.all([resolveExerciseAndProfile(supabase, lessonSlug, email), file.arrayBuffer()]);
    if ('error' in resolved) return resolved.error;
    if (bytes.byteLength < 1000) return NextResponse.json({ error: 'empty_media_file', detail: 'O arquivo enviado ficou vazio.' }, { status: 400 });
    const fileType = file.type || 'video/webm';
    const extension = fileType.includes('mp4') ? 'mp4' : 'webm';
    const basePath = `${pathPart(email)}/${resolved.exercise.id}/${Date.now()}-dueto`;
    const objectPath = `${basePath}.${extension}`;
    const { error: uploadError } = await uploadSubmissionFile(supabase, objectPath, bytes, fileType);
    if (uploadError) return NextResponse.json({ error: 'upload_failed', detail: uploadError.message }, { status: 500 });
    let posterUrl: string | null = null;
    if (poster instanceof File && poster.size > 300) {
      const posterType = poster.type || 'image/jpeg';
      const posterPath = `${basePath}-poster.${posterType.includes('png') ? 'png' : 'jpg'}`;
      const posterUpload = await uploadSubmissionFile(supabase, posterPath, await poster.arrayBuffer(), posterType);
      if (!posterUpload.error) posterUrl = supabase.storage.from(BUCKET).getPublicUrl(posterPath).data.publicUrl;
    }
    const { data: publicFile } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    return persistSubmission(supabase, resolved, { caption, visibility, reviewRequested, fileUrl: publicFile.publicUrl, posterUrl });
  } catch (error) {
    return NextResponse.json({ error: 'duet_submission_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
