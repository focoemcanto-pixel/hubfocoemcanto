import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDailyRoom } from '@/lib/daily';

const liveSchema = z.object({
  title: z.string().min(3).max(120),
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional().default(''),
  accessType: z.enum(['public', 'hybrid', 'restricted']).default('public'),
  guestAccessEnabled: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  recordingEnabled: z.boolean().default(false),
  shareImageUrl: z.string().url().optional().nullable(),
  creationMode: z.enum(['later', 'instant', 'scheduled']).optional().default('scheduled'),
});

export async function POST(request: NextRequest) {
  const accessEmail = request.cookies.get('hub_access_email')?.value;
  if (!accessEmail) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    const input = liveSchema.parse(await request.json());
    const roomName = `foco-${input.slug}-${Date.now().toString(36)}`;
    const expiration = input.startsAt
      ? Math.floor(new Date(input.startsAt).getTime() / 1000) + 60 * 60 * 6
      : Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

    const dailyRoom = await createDailyRoom({
      name: roomName,
      privacy: 'private',
      properties: {
        exp: expiration,
        enable_chat: false,
        enable_people_ui: false,
        enable_screenshare: true,
        start_video_off: true,
        start_audio_off: true,
        enable_recording: input.recordingEnabled ? 'cloud' : false,
      },
    });

    const status = input.creationMode === 'instant' ? 'live' : input.startsAt ? 'scheduled' : 'draft';
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('live_sessions')
      .insert({
        title: input.title,
        slug: input.slug,
        description: input.description,
        access_type: input.accessType,
        guest_access_enabled: input.guestAccessEnabled,
        starts_at: input.startsAt,
        status,
        recording_enabled: input.recordingEnabled,
        daily_room_name: dailyRoom.name,
        daily_room_url: dailyRoom.url,
        created_by: accessEmail,
        offer_config: input.shareImageUrl ? { share_image_url: input.shareImageUrl } : {},
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ live: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível criar a live.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
