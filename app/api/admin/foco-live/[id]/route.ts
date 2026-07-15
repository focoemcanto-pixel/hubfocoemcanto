import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteDailyRoom } from '@/lib/daily';

export const dynamic = 'force-dynamic';

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
    if (live.status === 'live') {
      return NextResponse.json({ error: 'Encerre a transmissão antes de apagá-la.' }, { status: 409 });
    }

    if (live.daily_room_name) {
      await deleteDailyRoom(live.daily_room_name);
    }

    const { error: deleteError } = await supabase.from('live_sessions').delete().eq('id', id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível apagar a live.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
