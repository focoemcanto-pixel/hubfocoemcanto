import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'submission-media';

function pathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file = data.get('file');
    const lessonSlug = String(data.get('lesson_slug') || '');
    const caption = String(data.get('caption') || '').trim();
    const visibility = String(data.get('visibility') || 'private');
    const email = (await cookies()).get('hub_access_email')?.value || '';

    if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    if (!(file instanceof File) || !lessonSlug) return NextResponse.json({ error: 'missing_payload' }, { status: 400 });

    const supabase = createAdminClient();
    const { data: exercise } = await supabase.from('exercises').select('id,slug').eq('slug', lessonSlug).maybeSingle();
    if (!exercise?.id) return NextResponse.json({ error: 'exercise_not_found' }, { status: 404 });

    let { data: profile } = await supabase.from('profiles').select('id,email').eq('email', email).maybeSingle();
    if (!profile?.id) {
      const { data: created, error: profileError } = await supabase
        .from('profiles')
        .insert({ email, name: email.split('@')[0], role: 'student' })
        .select('id,email')
        .single();
      if (profileError || !created) return NextResponse.json({ error: 'profile_failed', detail: profileError?.message }, { status: 500 });
      profile = created;
    }

    const bytes = await file.arrayBuffer();
    const objectPath = `${pathPart(email)}/${exercise.id}/${Date.now()}-dueto.webm`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: file.type || 'video/webm',
      upsert: true,
    });
    if (uploadError) return NextResponse.json({ error: 'upload_failed', detail: uploadError.message }, { status: 500 });

    const { data: publicFile } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    const fileUrl = publicFile.publicUrl;

    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .insert({
        profile_id: profile.id,
        exercise_id: exercise.id,
        file_url: fileUrl,
        file_type: 'duet_video',
        note: caption || 'Dueto gravado no Hub.',
        visibility: visibility === 'community' ? 'community' : 'private',
        status: 'pending_review',
      })
      .select('id')
      .single();

    if (submissionError || !submission) return NextResponse.json({ error: 'submission_failed', detail: submissionError?.message }, { status: 500 });

    return NextResponse.json({ ok: true, id: submission.id });
  } catch (error) {
    return NextResponse.json({ error: 'duet_submission_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
