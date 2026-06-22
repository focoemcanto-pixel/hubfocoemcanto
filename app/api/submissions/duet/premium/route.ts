import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'submission-media';
let bucketReady = false;

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

export async function POST(request: Request) {
  try {
    const [form, cookieStore] = await Promise.all([request.formData(), cookies()]);
    const email = cookieStore.get('hub_access_email')?.value || '';
    const file = form.get('file');
    const submissionId = String(form.get('submission_id') || '');

    if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    if (!(file instanceof File) || !submissionId) return NextResponse.json({ error: 'missing_payload' }, { status: 400 });
    if (file.size < 1000) return NextResponse.json({ error: 'empty_media_file' }, { status: 400 });

    const supabase = createAdminClient();
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id,email').eq('email', email).maybeSingle();
    if (profileError) return NextResponse.json({ error: 'profile_query_failed', detail: profileError.message }, { status: 500 });
    if (!profile?.id) return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });

    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .select('id,exercise_id,profile_id')
      .eq('id', submissionId)
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (submissionError) return NextResponse.json({ error: 'submission_query_failed', detail: submissionError.message }, { status: 500 });
    if (!submission?.id) return NextResponse.json({ error: 'submission_not_found' }, { status: 404 });

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength < 1000) return NextResponse.json({ error: 'empty_media_file' }, { status: 400 });

    const fileType = file.type || 'video/webm';
    const extension = fileType.includes('mp4') ? 'mp4' : 'webm';
    const objectPath = `${pathPart(email)}/${submission.exercise_id}/${Date.now()}-dueto-premium.${extension}`;
    const { error: uploadError } = await uploadSubmissionFile(supabase, objectPath, bytes, fileType);
    if (uploadError) return NextResponse.json({ error: 'upload_failed', detail: uploadError.message }, { status: 500 });

    const { data: publicFile } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    const fileUrl = publicFile.publicUrl;

    const { error: updateSubmissionError } = await supabase
      .from('submissions')
      .update({ file_url: fileUrl })
      .eq('id', submission.id)
      .eq('profile_id', profile.id);
    if (updateSubmissionError) return NextResponse.json({ error: 'submission_update_failed', detail: updateSubmissionError.message }, { status: 500 });

    await supabase
      .from('community_posts')
      .update({ media_url: fileUrl })
      .eq('submission_id', submission.id)
      .eq('profile_id', profile.id);

    return NextResponse.json({ ok: true, file_url: fileUrl });
  } catch (error) {
    return NextResponse.json({ error: 'premium_duet_update_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
