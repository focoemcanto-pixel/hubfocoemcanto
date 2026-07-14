import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const schema = z.object({ offerIds: z.array(z.string().uuid()).max(20) });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { offerIds } = schema.parse(await request.json());
    const supabase = createAdminClient();

    const { error: deleteError } = await supabase
      .from('live_session_offers')
      .delete()
      .eq('live_session_id', id);
    if (deleteError) throw deleteError;

    if (offerIds.length) {
      const { error: insertError } = await supabase.from('live_session_offers').insert(
        offerIds.map((offerId, index) => ({
          live_session_id: id,
          offer_id: offerId,
          sort_order: index,
        })),
      );
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true, offerIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível vincular as ofertas.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
