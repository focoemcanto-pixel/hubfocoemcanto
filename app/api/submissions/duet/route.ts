import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'submission-media';
let bucketReady = false;

type ResolvedSubmissionContext = {
  exercise: { id: string };
  profile: { id: string; email?: string | null };
};

function pathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

async function uploadSubmissionFile(supabase: ReturnType<typeof createAdminClient>, objectPath: string, bytes: ArrayBuffer, fileType: string) {
  const firstUpload = await supabase.storage.from(BUCKET).upload(objectPath, bytes, { contentType: fileType, upsert: true });
  if (!firstUpload.error) {
    bucketReady = true;
    return firstUpload;
  }

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

  if (profile?.id) return { exercise, profile };

  const { data: created, error: profileError } = await supabase
    .from('profiles')
    .insert({ email, name: email.split('@')[0], role: 'student' })
    .select('id,email')
    .single();

  if (profileError || !created) return { error: NextResponse.json({ error: 'profile_failed', detail: profileError?.message }, { status: 500 }) };
  return { exercise, profile: created };
}

async function persistSubmission(supabase: ReturnType<typeof createAdminClient>, context: ResolvedSubmissionContext, params: { caption: string; visibility: string; fileUrl: string }) {
  const isCommunity = params.visibility === 'community';
  const { data: submission, error: submissionError } = await supabase.from('submissions').insert({
    profile_id: context.profile.id,
    exercise_id: context.exercise.id,
    file_url: params.fileUrl,
    file_type: 'duet_video',
    note: params.caption || 'Dueto gravado no Hub.',
    visibility: isCommunity ? 'community' : 'private',
    status: 'pending_review',
  }).select('id').single();

  if (submissionError || !submission) return NextResponse.json({ error: 'submission_failed', detail: submissionError?.message }, { status: 500 });

  if (isCommunity) {
    const { error: postError } = await supabase.from('community_posts').insert({
      profile_id: context.profile.id,
      exercise_id: context.exercise.id,
      submission_id: submission.id,
      media_url: params.fileUrl,
      caption: params.caption || 'Minha prática do dueto.',
      category: 'dueto',
    });
    if (postError) return NextResponse.json({ error: 'community_post_failed', detail: postError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: submission.id });
}

async function saveSubmission(params: { lessonSlug: string; caption: string; visibility: string; fileUrl: string }) {
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
      return saveSubmission({ lessonSlug: String(body.lesson_slug || ''), caption: String(body.caption || '').trim(), visibility: String(body.visibility || 'private'), fileUrl: String(body.file_url || '').trim() });
    }

    const [form, cookieStore] = await Promise.all([request.formData(), cookies()]);
    const file = form.get('file');
    const lessonSlug = String(form.get('lesson_slug') || '');
    const caption = String(form.get('caption') || '').trim();
    const visibility = String(form.get('visibility') || 'private');
    const email = cookieStore.get('hub_access_email')?.value || '';

    if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    if (!(file instanceof File) || !lessonSlug) return NextResponse.json({ error: 'missing_payload' }, { status: 400 });

    const supabase = createAdminClient();
    const [resolved, bytes] = await Promise.all([
      resolveExerciseAndProfile(supabase, lessonSlug, email),
      file.arrayBuffer(),
    ]);
    if ('error' in resolved) return resolved.error;

    const fileType = file.type || 'video/webm';
    const extension = fileType.includes('mp4') ? 'mp4' : 'webm';
    const objectPath = `${pathPart(email)}/${resolved.exercise.id}/${Date.now()}-dueto.${extension}`;

    const { error: uploadError } = await uploadSubmissionFile(supabase, objectPath, bytes, fileType);
    if (uploadError) return NextResponse.json({ error: 'upload_failed', detail: uploadError.message }, { status: 500 });

    const { data: publicFile } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    return persistSubmission(supabase, resolved, { caption, visibility, fileUrl: publicFile.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: 'duet_submission_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
