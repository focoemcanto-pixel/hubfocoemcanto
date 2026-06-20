import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const lessonSlug = String(body.lesson_slug || '');
    const caption = String(body.caption || '').trim();
    const visibility = String(body.visibility || 'private');
    const fileUrl = String(body.file_url || '').trim();
    const email = (await cookies()).get('hub_access_email')?.value || '';

    if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    if (!lessonSlug || !fileUrl) return NextResponse.json({ error: 'missing_payload' }, { status: 400 });

    const supabase = createAdminClient();
    const { data: exercise, error: exerciseError } = await supabase
      .from('exercises')
      .select('id,slug')
      .eq('slug', lessonSlug)
      .maybeSingle();

    if (exerciseError) return NextResponse.json({ error: 'exercise_query_failed', detail: exerciseError.message }, { status: 500 });
    if (!exercise?.id) return NextResponse.json({ error: 'exercise_not_found' }, { status: 404 });

    let { data: profile, error: profileQueryError } = await supabase
      .from('profiles')
      .select('id,email')
      .eq('email', email)
      .maybeSingle();

    if (profileQueryError) return NextResponse.json({ error: 'profile_query_failed', detail: profileQueryError.message }, { status: 500 });

    if (!profile?.id) {
      const { data: created, error: profileError } = await supabase
        .from('profiles')
        .insert({ email, name: email.split('@')[0], role: 'student' })
        .select('id,email')
        .single();
      if (profileError || !created) return NextResponse.json({ error: 'profile_failed', detail: profileError?.message }, { status: 500 });
      profile = created;
    }

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
