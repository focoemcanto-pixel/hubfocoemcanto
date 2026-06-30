import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseBoolean, parseInteger, pathPart, resolveExerciseAndProfile, uploadRenderInput } from '@/lib/duet-render/queue';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const [form, cookieStore] = await Promise.all([request.formData(), cookies()]);
    const email = cookieStore.get('hub_access_email')?.value || '';
    if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

    const lessonSlug = String(form.get('lesson_slug') || '');
    const video = form.get('video');
    const voice = form.get('voice');
    const referenceUrl = String(form.get('reference_url') || '').trim();
    const caption = String(form.get('caption') || '').trim();
    const visibility = String(form.get('visibility') || 'private');
    const reviewRequested = parseBoolean(form.get('review_requested'), true);
    const voiceVolume = parseInteger(form.get('voice_volume'), 100, 0, 200);
    const referenceVolume = parseInteger(form.get('reference_volume'), 70, 0, 200);
    const referenceOffsetMs = parseInteger(form.get('reference_offset_ms'), 0, -3000, 3000);

    if (!lessonSlug || !(video instanceof File) || !(voice instanceof File) || !referenceUrl) {
      return NextResponse.json({ error: 'missing_payload' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const resolved = await resolveExerciseAndProfile(supabase, lessonSlug, email);
    if ('error' in resolved) return resolved.error;

    if (reviewRequested && !resolved.canRequestReview && visibility !== 'community') {
      return NextResponse.json({ error: 'vip_required', detail: 'Avaliação do professor é exclusiva para assinantes VIP.' }, { status: 403 });
    }

    const now = Date.now();
    const basePath = `${pathPart(email)}/${resolved.exercise.id}/render-jobs/${now}`;
    const videoExt = (video.type || '').includes('webm') ? 'webm' : 'mp4';
    const voiceExt = (voice.type || '').includes('webm') ? 'webm' : 'm4a';
    const [videoUpload, voiceUpload] = await Promise.all([
      uploadRenderInput(supabase, `${basePath}-visual.${videoExt}`, video, 'video/mp4'),
      uploadRenderInput(supabase, `${basePath}-voice.${voiceExt}`, voice, 'audio/mp4'),
    ]);

    const outputPath = `${basePath}-final.mp4`;
    const { data: job, error: jobError } = await supabase
      .from('duet_render_jobs')
      .insert({
        profile_id: resolved.profile.id,
        exercise_id: resolved.exercise.id,
        status: 'pending',
        source_video_url: videoUpload.url,
        source_voice_url: voiceUpload.url,
        reference_url: referenceUrl,
        source_video_path: videoUpload.path,
        source_voice_path: voiceUpload.path,
        output_path: outputPath,
        caption: caption || 'Minha prática do dueto.',
        visibility,
        review_requested: reviewRequested,
        voice_volume: voiceVolume,
        reference_volume: referenceVolume,
        reference_offset_ms: referenceOffsetMs,
        render_meta: { created_from: 'hub_duet_recorder', mode: 'server_render_queue' },
      })
      .select('id,status,created_at')
      .single();

    if (jobError || !job) return NextResponse.json({ error: 'render_job_failed', detail: jobError?.message }, { status: 500 });
    return NextResponse.json({ ok: true, job_id: job.id, status: job.status, created_at: job.created_at });
  } catch (error) {
    return NextResponse.json({ error: 'duet_render_job_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
