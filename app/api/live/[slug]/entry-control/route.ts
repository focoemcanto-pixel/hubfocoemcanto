import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['lock','unlock','approve','deny','approve-all']),
  requestId: z.string().uuid().optional(),
});

function authorized(request: NextRequest) {
  return Boolean(request.cookies.get('hub_access_email')?.value);
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const { slug } = await context.params;
  const supabase = createAdminClient();
  const { data: live } = await supabase.from('live_sessions').select('id,waiting_room_locked').eq('slug', slug).maybeSingle();
  if (!live) return NextResponse.json({ error: 'Live não encontrada.' }, { status: 404 });
  const { data: requests } = await supabase
    .from('live_entry_requests')
    .select('id,guest_name,guest_email,guest_whatsapp,status,created_at')
    .eq('live_session_id', live.id)
    .eq('status', 'pending')
    .order('created_at');
  return NextResponse.json({ locked: live.waiting_room_locked, requests: requests || [] });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const { slug } = await context.params;
  const input = schema.parse(await request.json());
  const supabase = createAdminClient();
  const { data: live } = await supabase.from('live_sessions').select('id').eq('slug', slug).maybeSingle();
  if (!live) return NextResponse.json({ error: 'Live não encontrada.' }, { status: 404 });

  if (input.action === 'lock' || input.action === 'unlock') {
    await supabase.from('live_sessions').update({ waiting_room_locked: input.action === 'lock' }).eq('id', live.id);
  } else if (input.action === 'approve-all') {
    await supabase.from('live_entry_requests').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('live_session_id', live.id).eq('status', 'pending');
  } else {
    if (!input.requestId) return NextResponse.json({ error: 'Solicitação obrigatória.' }, { status: 400 });
    await supabase.from('live_entry_requests').update({ status: input.action === 'approve' ? 'approved' : 'denied', decided_at: new Date().toISOString() }).eq('id', input.requestId).eq('live_session_id', live.id);
  }
  return NextResponse.json({ ok: true });
}
