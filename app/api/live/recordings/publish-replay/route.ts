import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type Body = {
  title?: string;
  description?: string;
  driveFileId?: string;
  driveFolderId?: string;
  fileName?: string;
  mimeType?: string;
  liveSessionId?: string;
  availableUntil?: string | null;
};

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `replay-${Date.now()}`;
}

async function uniqueSlug(supabase: ReturnType<typeof createAdminClient>, title: string) {
  const date = new Date().toLocaleDateString('pt-BR').replaceAll('/', '-');
  const base = slugify(`${title}-${date}`);
  let slug = base;
  let suffix = 2;

  while (true) {
    const { data } = await supabase.from('live_sessions').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${suffix++}`;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Body;
    if (!body.title || !body.driveFileId) {
      return NextResponse.json({ error: 'Dados do replay incompletos' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const mimeType = body.mimeType || 'video/webm';
    let sessionId = body.liveSessionId || null;
    let slug: string;

    if (sessionId) {
      const { data: existing, error: existingError } = await supabase
        .from('live_sessions')
        .select('id,slug')
        .eq('id', sessionId)
        .maybeSingle();

      if (existingError) throw new Error(existingError.message);
      if (!existing) return NextResponse.json({ error: 'A sessão da live não foi encontrada.' }, { status: 404 });
      slug = existing.slug;

      const { error } = await supabase.from('live_sessions').update({
        replay_enabled: true,
        replay_status: 'published',
        replay_custom_title: body.title.trim(),
        replay_custom_description: body.description?.trim() || null,
        replay_published_at: now,
        replay_expires_at: body.availableUntil || null,
        drive_file_id: body.driveFileId,
        drive_folder_id: body.driveFolderId || null,
        drive_url: `https://drive.google.com/file/d/${body.driveFileId}/view`,
        video_mime_type: mimeType,
        video_format: mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : null,
        video_processing_status: 'ready',
        updated_at: now,
      }).eq('id', sessionId);

      if (error) throw new Error(error.message);
    } else {
      slug = await uniqueSlug(supabase, body.title);
      const { data, error } = await supabase.from('live_sessions').insert({
        title: body.title.trim(),
        slug,
        description: body.description?.trim() || '',
        status: 'ended',
        ends_at: now,
        recording_enabled: true,
        replay_enabled: true,
        replay_status: 'published',
        replay_custom_title: body.title.trim(),
        replay_custom_description: body.description?.trim() || null,
        replay_published_at: now,
        replay_expires_at: body.availableUntil || null,
        drive_file_id: body.driveFileId,
        drive_folder_id: body.driveFolderId || null,
        drive_url: `https://drive.google.com/file/d/${body.driveFileId}/view`,
        video_mime_type: mimeType,
        video_format: mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : null,
        video_processing_status: 'ready',
      }).select('id').single();

      if (error) throw new Error(error.message);
      sessionId = data.id;
    }

    const { error: currentError } = await supabase.rpc('set_current_live_replay', {
      target_session_id: sessionId,
    });
    if (currentError) throw new Error(currentError.message);

    return NextResponse.json({
      replay: { id: sessionId, slug, title: body.title.trim() },
      currentUrl: '/replay',
      permanentUrl: `/replay/${slug}`,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível publicar o replay' }, { status: 500 });
  }
}
