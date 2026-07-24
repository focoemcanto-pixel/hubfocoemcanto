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

export async function POST(request: Request) {
  try {
    const body = await request.json() as Body;
    if (!body.title || !body.driveFileId) return NextResponse.json({ error: 'Dados do replay incompletos' }, { status: 400 });

    const supabase = createAdminClient();
    const date = new Date().toLocaleDateString('pt-BR').replaceAll('/', '-');
    const base = slugify(`${body.title}-${date}`);
    let slug = base;
    let suffix = 2;
    while (true) {
      const { data } = await supabase.from('live_replays').select('id').eq('slug', slug).maybeSingle();
      if (!data) break;
      slug = `${base}-${suffix++}`;
    }

    await supabase.from('live_replays').update({ is_current: false, updated_at: new Date().toISOString() }).eq('is_current', true);
    const { data, error } = await supabase.from('live_replays').insert({
      live_session_id: body.liveSessionId || null,
      title: body.title.trim(),
      slug,
      description: body.description?.trim() || null,
      drive_file_id: body.driveFileId,
      drive_folder_id: body.driveFolderId || null,
      file_name: body.fileName || null,
      mime_type: body.mimeType || 'video/webm',
      status: 'published',
      is_current: true,
      available_until: body.availableUntil || null,
      published_at: new Date().toISOString(),
    }).select('id,slug,title').single();

    if (error) throw new Error(error.message);
    return NextResponse.json({
      replay: data,
      currentUrl: '/replay',
      permanentUrl: `/replay/${slug}`,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível publicar o replay' }, { status: 500 });
  }
}
