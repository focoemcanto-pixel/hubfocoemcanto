import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteDailyRoom } from '@/lib/daily';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  title: z.string().min(3).max(120),
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).default(''),
  accessType: z.enum(['public', 'hybrid', 'restricted']),
  guestAccessEnabled: z.boolean(),
  startsAt: z.string().datetime().nullable(),
  recordingEnabled: z.boolean(),
  shareImageUrl: z.string().url().nullable(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const accessEmail = request.cookies.get('hub_access_email')?.value;
  if (!accessEmail) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const input = updateSchema.parse(await request.json());
    const supabase = createAdminClient();
    const { data: current } = await supabase.from('live_sessions').select('status,offer_config').eq('id', id).maybeSingle();
    if (!current) return NextResponse.json({ error: 'Live não encontrada.' }, { status: 404 });

    const nextStatus = current.status === 'live' || current.status === 'ended'
      ? current.status
      : input.startsAt ? 'scheduled' : 'draft';
    const offerConfig = { ...(current.offer_config || {}) };
    if (input.shareImageUrl) offerConfig.share_image_url = input.shareImageUrl;
    else delete offerConfig.share_image_url;

    const { data, error } = await supabase.from('live_sessions').update({
      title: input.title,
      slug: input.slug,
      description: input.description,
      access_type: input.accessType,
      guest_access_enabled: input.guestAccessEnabled,
      starts_at: input.startsAt,
      recording_enabled: input.recordingEnabled,
      status: nextStatus,
      offer_config: offerConfig,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ live: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível atualizar a live.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const accessEmail = request.cookies.get('hub_access_email')?.value;
    if (!accessEmail) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

    const { id } = await context.params;
    const supabase = createAdminClient();
    const { data: live, error } = await supabase
      .from('live_sessions')
      .select('id,status,daily_room_name')
      .eq('id', id)
      .maybeSingle();

    if (error || !live) return NextResponse.json({ error: 'Live não encontrada.' }, { status: 404 });
    if (live.status === 'live') return NextResponse.json({ error: 'Encerre a transmissão antes de apagá-la.' }, { status: 409 });
    if (live.daily_room_name) await deleteDailyRoom(live.daily_room_name);

    const { error: deleteError } = await supabase.from('live_sessions').delete().eq('id', id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível apagar a live.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
