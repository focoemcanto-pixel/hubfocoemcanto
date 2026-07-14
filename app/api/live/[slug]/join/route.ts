import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDailyMeetingToken } from '@/lib/daily';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().optional().or(z.literal('')),
  whatsapp: z.string().trim().max(30).optional().or(z.literal('')),
  mode: z.enum(['guest', 'student']).default('guest'),
});

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const input = schema.parse(await request.json());
    const supabase = createAdminClient();
    const { data: live, error } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !live) return NextResponse.json({ error: 'Live não encontrada.' }, { status: 404 });
    if (!['scheduled', 'live'].includes(live.status)) {
      return NextResponse.json({ error: 'Esta live ainda não está disponível.' }, { status: 403 });
    }
    if (!live.daily_room_name || !live.daily_room_url) {
      return NextResponse.json({ error: 'Sala de vídeo ainda não configurada.' }, { status: 409 });
    }
    if (input.mode === 'guest' && !live.guest_access_enabled) {
      return NextResponse.json({ error: 'A entrada como convidado não está habilitada.' }, { status: 403 });
    }
    if (live.access_type === 'restricted' && input.mode === 'guest') {
      return NextResponse.json({ error: 'Esta live é exclusiva para alunos autorizados.' }, { status: 403 });
    }

    const accessEmail = request.cookies.get('hub_access_email')?.value;
    let profileId: string | null = null;
    if (accessEmail) {
      const { data: profile } = await supabase.from('profiles').select('id,name,email').eq('email', accessEmail).maybeSingle();
      profileId = profile?.id || null;
    }

    const { data: participant, error: participantError } = await supabase
      .from('live_participants')
      .insert({
        live_session_id: live.id,
        profile_id: profileId,
        guest_name: input.name,
        guest_email: input.email || null,
        guest_whatsapp: input.whatsapp || null,
        participant_type: profileId ? 'student' : 'guest',
      })
      .select('id')
      .single();

    if (participantError) throw participantError;

    const token = await createDailyMeetingToken(live.daily_room_name, false, input.name);
    return NextResponse.json({
      live: {
        id: live.id,
        title: live.title,
        description: live.description,
        status: live.status,
        currentScene: live.current_scene,
        offerConfig: live.offer_config || {},
      },
      participantId: participant.id,
      roomUrl: live.daily_room_url,
      token: token.token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível entrar na live.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
