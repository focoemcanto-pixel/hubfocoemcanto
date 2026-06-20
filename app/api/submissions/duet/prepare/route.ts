import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'submission-media';

function pathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

async function ensureSubmissionBucket() {
  const supabase = createAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) return { ok: false, error: listError.message };

  const exists = buckets?.some((bucket) => bucket.id === BUCKET || bucket.name === BUCKET);
  if (exists) return { ok: true };

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 524288000,
    allowedMimeTypes: ['video/webm', 'video/mp4', 'video/quicktime'],
  });

  if (createError) return { ok: false, error: createError.message };
  return { ok: true };
}

export async function POST(request: Request) {
  try {
    const { lesson_slug } = await request.json();
    const lessonSlug = String(lesson_slug || '');
    const email = (await cookies()).get('hub_access_email')?.value || '';

    if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    if (!lessonSlug) return NextResponse.json({ error: 'missing_lesson_slug' }, { status: 400 });

    const supabase = createAdminClient();
    const bucket = await ensureSubmissionBucket();
    if (!bucket.ok) return NextResponse.json({ error: 'bucket_failed', detail: bucket.error }, { status: 500 });

    const { data: exercise, error: exerciseError } = await supabase
      .from('exercises')
      .select('id,slug')
      .eq('slug', lessonSlug)
      .maybeSingle();

    if (exerciseError) return NextResponse.json({ error: 'exercise_query_failed', detail: exerciseError.message }, { status: 500 });
    if (!exercise?.id) return NextResponse.json({ error: 'exercise_not_found' }, { status: 404 });

    const objectPath = `${pathPart(email)}/${exercise.id}/${Date.now()}-dueto.webm`;
    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(objectPath);

    if (signedError || !signed) {
      return NextResponse.json({ error: 'signed_upload_failed', detail: signedError?.message }, { status: 500 });
    }

    const { data: publicFile } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

    return NextResponse.json({
      ok: true,
      bucket: BUCKET,
      path: objectPath,
      token: signed.token,
      signedUrl: signed.signedUrl,
      fileUrl: publicFile.publicUrl,
    });
  } catch (error) {
    return NextResponse.json({ error: 'prepare_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
