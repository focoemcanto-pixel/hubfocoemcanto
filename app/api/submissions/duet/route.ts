import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'submission-media';

function pathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

async function ensureBucket() {
  const supabase = createAdminClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((bucket) => bucket.id === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 524288000 });
}

async function saveSubmission(params: { lessonSlug: string; caption: string; visibility: string; fileUrl: string }) {
  const email = (await cookies()).get('hub_access_email')?.value || '';
  if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  if (!params.lessonSlug || !params.fileUrl) return NextResponse.json({ error: 'missing_payload' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: exercise, error: exerciseError } = await supabase.from('exercises').select('id').eq('slug', params.lessonSlug).maybeSingle();
  if (exerciseError) return NextResponse.json({ error: 'exercise_query_failed', detail: exerciseError.message }, { status: 500 });
  if (!exercise?.id) return NextResponse.json({ error: 'exercise_not_found' }, { status: 404 });

  let { data: profile, error: profileQueryError } = await supabase.from('profiles').select('id,email').eq('email', email).maybeSingle();
  if (profileQueryError) return NextResponse.json({ error: 'profile_query_failed', detail: profileQueryError.message }, { status: 500 });

  if (!profile?.id) {
    const { data: created, error: profileError } = await supabase.from('profiles').insert({ email, name: email.split('@')[0], role: 'student' }).select('id,email').single();
    if (profileError || !created) return NextResponse.json({ error: 'profile_failed', detail: profileError?.message }, { status: 500 });
    profile = created;
  }

  const { data: submission, error: submissionError } = await supabase.from('submissions').insert({
    profile_id: profile.id,
    exercise_id: exercise.id,
    file_url: params.fileUrl,
    file_type: 'duet_video',
    note: params.caption || 'Dueto gravado no Hub.',
    visibility: params.visibility === 'community' ? 'community' : 'private',
    status: 'pending_review',
  }).select('id').single();

  if (submissionError || !submission) return NextResponse.json({ error: 'submission_failed', detail: submissionError?.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: submission.id });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      return saveSubmission({
        lessonSlug: String(body.lesson_slug || ''),
        caption: String(body.caption || '').trim(),
        visibility: String(body.visibility || 'private'),
        fileUrl: String(body.file_url || '').trim(),
      });
    }

    const form = await request.formData();
    const file = form.get('file');
    const lessonSlug = String(form.get('lesson_slug') || '');
    const caption = String(form.get('caption') || '').trim();
    const visibility = String(form.get('visibility') || 'private');
    const email = (await cookies()).get('hub_access_email')?.value || '';

    if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    if (!(file instanceof File) || !lessonSlug) return NextResponse.json({ error: 'missing_payload' }, { status: 400 });

    const supabase = createAdminClient();
    await ensureBucket();

    const { data: exercise } = await supabase.from('exercises').select('id').eq('slug', lessonSlug).maybeSingle();
    const exerciseId = exercise?.id || 'sem-aula';
    const objectPath = `${pathPart(email)}/${exerciseId}/${Date.now()}-dueto.webm`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, file, { contentType: file.type || 'video/webm', upsert: true });
    if (uploadError) return NextResponse.json({ error: 'upload_failed', detail: uploadError.message }, { status: 500 });

    const { data: publicFile } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    return saveSubmission({ lessonSlug, caption, visibility, fileUrl: publicFile.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: 'duet_submission_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
