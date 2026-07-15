import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().optional().or(z.literal('')),
  whatsapp: z.string().trim().max(30).optional().or(z.literal('')),
});

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const input = createSchema.parse(await request.json());
  const supabase = createAdminClient();

  const { data: live } = await supabase
    .from('live_sessions')
    .select('id,status,waiting_room_locked')
    .eq('slug', slug)
    .maybeSingle();

  if (!live) return NextResponse.json({ error: 'Live não encontrada.' }, { status: 404 });
  if (live.status !== 'live') return NextResponse.json({ error: 'A transmissão ainda não está disponível.' }, { status: 403 });

  if (!live.waiting_room_locked) {
    return NextResponse.json({ status: 'open' });
  }

  const { data, error } = await supabase
    .from('live_entry_requests')
    .insert({
      live_session_id: live.id,
      guest_name: input.name,
      guest_email: input.email || null,
      guest_whatsapp: input.whatsapp || null,
      status: 'pending',
    })
    .select('id,status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 202 });
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const requestId = request.nextUrl.searchParams.get('requestId');
  if (!requestId) return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('live_entry_requests')
    .select('id,status')
    .eq('id', requestId)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 });
  return NextResponse.json(data);
}
