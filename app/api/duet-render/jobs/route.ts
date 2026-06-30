import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseBoolean, parseInteger, pathPart, resolveExerciseAndProfile, uploadRenderInput, uploadRenderOutput } from '@/lib/duet-render/queue';

export const dynamic = 'force-dynamic';

async function renderWithWorker(params: {
  video: File;
  voice: File;
  referenceUrl: string;
  voiceVolume: number;
  referenceVolume: number;
  referenceOffsetMs: number;
}) {
  const workerUrl = String(process.env.DUET_RENDER_WORKER_URL || '').replace(/\/$/, '');
  if (!workerUrl) return null;

  const data = new FormData();
  data.set('referenceUrl', params.referenceUrl);
  data.set('voiceVolume', String(params.voiceVolume));
  data.set('referenceVolume', String(params.referenceVolume));
  data.set('offsetMs', String(params.referenceOffsetMs));
  data.set('video', params.video);
  data.set('voice', params.voice);

  const headers: HeadersInit = {};
  const apiKey = String(process.env.DUET_RENDER_API_KEY || '').trim();
  if (apiKey) headers['x-api-key'] = apiKey;

  const response = await fetch(`${workerUrl}/render-duet`, { method: 'POST', headers, body: data });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`worker_render_failed:${response.status}:${text.slice(0, 240)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('video')) throw new Error(`worker_invalid_content_type:${contentType}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 1000) throw new Error(`worker_empty_output:${bytes.byteLength}`);
  return bytes;
}

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

    try {
      const renderedBytes = await renderWithWorker({ video, voice, referenceUrl, voiceVolume, referenceVolume, referenceOffsetMs });
      if (renderedBytes) {
        const output = await uploadRenderOutput(supabase, outputPath, renderedBytes);
        const { error: updateError } = await supabase
          .from('duet_render_jobs')
          .update({ status: 'completed', output_url: output.url, output_path: output.path, completed_at: new Date().toISOString(), render_meta: { mode: 'worker_sync', bytes: renderedBytes.byteLength } })
          .eq('id', job.id);
        if (updateError) throw new Error(updateError.message);
        return NextResponse.json({ ok: true, job_id: job.id, status: 'completed', output_url: output.url, created_at: job.created_at });
      }
    } catch (workerError) {
      const message = workerError instanceof Error ? workerError.message : String(workerError);
      await supabase.from('duet_render_jobs').update({ status: 'failed', error_message: message }).eq('id', job.id);
      return NextResponse.json({ ok: true, job_id: job.id, status: 'failed', error_message: message, created_at: job.created_at });
    }

    return NextResponse.json({ ok: true, job_id: job.id, status: job.status, created_at: job.created_at });
  } catch (error) {
    return NextResponse.json({ error: 'duet_render_job_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
