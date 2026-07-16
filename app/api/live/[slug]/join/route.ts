import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDailyMeetingToken, createDailyRoom, updateDailyRoom } from '@/lib/daily';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().optional().or(z.literal('')),
  whatsapp: z.string().trim().max(30).optional().or(z.literal('')),
  mode: z.enum(['guest', 'student', 'host']).default('guest'),
  admissionToken: z.string().uuid().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const input = schema.parse(await request.json());
    const supabase = createAdminClient();
    const { data: foundLive, error } = await supabase.from('live_sessions').select('*').eq('slug', slug).single();
    if (error || !foundLive) return NextResponse.json({ error: 'Live não encontrada.' }, { status: 404 });

    let live = foundLive;
    const accessEmail = request.cookies.get('hub_access_email')?.value;
    const requestedHost = input.mode === 'host';
    const isHost = requestedHost && Boolean(accessEmail);
    const effectiveMode = isHost ? 'host' : accessEmail && input.mode === 'student' ? 'student' : 'guest';

    if (live.status === 'ended') return NextResponse.json({ error: 'Esta aula foi encerrada.', ended: true }, { status: 410 });
    if (!isHost && live.status !== 'live') return NextResponse.json({ error: 'A transmissão ainda não começou.', fallbackMode: requestedHost ? 'guest' : undefined }, { status: 403 });
    if (isHost && !['draft', 'scheduled', 'live'].includes(live.status)) return NextResponse.json({ error: 'Esta transmissão não pode ser aberta no estúdio.' }, { status: 403 });

    const scheduledAt = live.starts_at ? new Date(live.starts_at).getTime() : null;
    const roomLikelyExpired = Boolean(scheduledAt && Date.now() > scheduledAt + 6 * 60 * 60 * 1000);
    const needsRoom = !live.daily_room_name || !live.daily_room_url || roomLikelyExpired;
    const roomProperties = {
      enable_chat: false,
      enable_people_ui: false,
      enable_screenshare: true,
      start_video_off: false,
      start_audio_off: false,
      enable_recording: live.recording_enabled ? 'cloud' : false,
    };

    if (isHost && needsRoom) {
      const roomName = `foco-${slug}-${Date.now().toString(36)}`;
      const dailyRoom = await createDailyRoom({
        name: roomName,
        privacy: 'private',
        properties: { ...roomProperties, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 },
      });
      const { data: refreshedLive, error: roomUpdateError } = await supabase.from('live_sessions').update({ daily_room_name: dailyRoom.name, daily_room_url: dailyRoom.url }).eq('id', live.id).select('*').single();
      if (roomUpdateError || !refreshedLive) throw roomUpdateError || new Error('Não foi possível renovar a sala de vídeo.');
      live = refreshedLive;
    }

    if (!live.daily_room_name || !live.daily_room_url) return NextResponse.json({ error: 'Sala de vídeo ainda não configurada.' }, { status: 409 });

    // Salas já existentes podem ter sido criadas antes de a gravação ser habilitada.
    // Atualizamos as propriedades quando o host entra para que o botão Gravar reflita
    // a configuração atual da live, sem obrigar a recriação da sala.
    if (isHost && !needsRoom) await updateDailyRoom(live.daily_room_name, roomProperties);

    if (!isHost && effectiveMode === 'guest' && !live.guest_access_enabled) return NextResponse.json({ error: 'A entrada como convidado não está habilitada.' }, { status: 403 });
    if (!isHost && live.access_type === 'restricted' && effectiveMode === 'guest') return NextResponse.json({ error: 'Esta live é exclusiva para alunos autorizados.' }, { status: 403 });

    if (!isHost && live.waiting_room_locked) {
      let approved = false;
      if (input.admissionToken) {
        const { data: admission } = await supabase.from('live_entry_requests').select('id,status').eq('id', input.admissionToken).eq('live_session_id', live.id).maybeSingle();
        approved = admission?.status === 'approved';
      }
      if (!approved) return NextResponse.json({ error: 'Aguardando aprovação do host.', waitingRoom: true }, { status: 423 });
      await supabase.from('live_entry_requests').update({ status: 'consumed', consumed_at: new Date().toISOString() }).eq('id', input.admissionToken!);
    }

    let profileId: string | null = null;
    let profilePayload: { id: string; name: string | null; avatar_url: string | null } | null = null;
    if (accessEmail && !isHost) {
      const { data: profile } = await supabase.from('profiles').select('id,name,email,avatar_url').eq('email', accessEmail).maybeSingle();
      profileId = profile?.id || null;
      profilePayload = profile ? { id: profile.id, name: profile.name || null, avatar_url: profile.avatar_url || null } : null;
    }

    const { data: participant, error: participantError } = await supabase.from('live_participants').insert({
      live_session_id: live.id,
      profile_id: profileId,
      guest_name: input.name,
      guest_email: input.email || null,
      guest_whatsapp: input.whatsapp || null,
      participant_type: isHost ? 'host' : profileId ? 'student' : 'guest',
    }).select('id').single();
    if (participantError) throw participantError;

    const dailyUserId = `${isHost ? 'host' : 'participant'}-${participant.id}`;
    const token = await createDailyMeetingToken(live.daily_room_name, isHost, input.name, dailyUserId);

    return NextResponse.json({
      live: { id: live.id, title: live.title, description: live.description, status: live.status, currentScene: live.current_scene, offerConfig: live.offer_config || {}, waitingRoomLocked: Boolean(live.waiting_room_locked), recordingEnabled: Boolean(live.recording_enabled) },
      participantId: participant.id,
      participantProfile: profilePayload,
      roomUrl: live.daily_room_url,
      token: token.token,
      isHost,
      effectiveMode,
      hostFallback: requestedHost && !isHost,
      roomRenewed: needsRoom,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível entrar na live.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
