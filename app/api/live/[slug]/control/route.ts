import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('end') }),
  z.object({ action: z.literal('scene'), scene: z.enum(['waiting', 'class', 'screen', 'offer', 'notice']), offer: z.record(z.string(), z.any()).optional() }),
]);

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const accessEmail = request.cookies.get('hub_access_email')?.value;
    if (!accessEmail) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

    const { slug } = await context.params;
    const input = schema.parse(await request.json());
    const supabase = createAdminClient();

    const { data: live, error } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !live) return NextResponse.json({ error: 'Live não encontrada.' }, { status: 404 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.action === 'start') {
      patch.status = 'live';
      patch.current_scene = 'class';
    }
    if (input.action === 'end') {
      patch.status = 'ended';
      patch.ends_at = new Date().toISOString();
    }
    if (input.action === 'scene') {
      patch.current_scene = input.scene;
      if (input.offer) patch.offer_config = input.offer;
    }

    const { data: updated, error: updateError } = await supabase
      .from('live_sessions')
      .update(patch)
      .eq('id', live.id)
      .select('id,status,current_scene,offer_config,ends_at')
      .single();

    if (updateError) throw updateError;
    return NextResponse.json({ live: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível controlar a live.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
