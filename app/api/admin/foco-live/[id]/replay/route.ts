import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  action: z.enum(['publish', 'disable']),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const accessEmail = request.cookies.get('hub_access_email')?.value;
  if (!accessEmail) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    const { id } = await context.params;
    const { action } = schema.parse(await request.json());
    const supabase = createAdminClient();
    const { data: live } = await supabase
      .from('live_sessions')
      .select('id,slug,drive_file_id')
      .eq('id', id)
      .maybeSingle();

    if (!live) return NextResponse.json({ error: 'Aula não encontrada.' }, { status: 404 });

    if (action === 'publish') {
      if (!live.drive_file_id) return NextResponse.json({ error: 'Esta aula não possui vídeo vinculado.' }, { status: 409 });
      const { error } = await supabase.rpc('set_current_live_replay', { target_session_id: id });
      if (error) throw error;
      return NextResponse.json({ success: true, currentUrl: '/replay', permanentUrl: `/replay/${live.slug}` });
    }

    const { error } = await supabase
      .from('live_sessions')
      .update({
        replay_enabled: false,
        replay_is_current: false,
        replay_status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível atualizar o replay.' }, { status: 400 });
  }
}
