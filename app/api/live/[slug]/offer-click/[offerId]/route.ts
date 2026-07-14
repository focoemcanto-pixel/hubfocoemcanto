import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; offerId: string }> },
) {
  const { slug, offerId } = await context.params;
  const supabase = createAdminClient();

  const { data: live } = await supabase
    .from('live_sessions')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  const { data: offer } = await supabase
    .from('live_offers')
    .select('id,checkout_url,is_active')
    .eq('id', offerId)
    .maybeSingle();

  if (!offer?.checkout_url || offer.is_active === false) {
    return NextResponse.redirect(new URL(`/live/${slug}`, request.url));
  }

  if (live?.id) {
    await supabase.from('live_offer_events').insert({
      live_session_id: live.id,
      offer_id: offer.id,
      event_type: 'click',
      metadata: {
        user_agent: request.headers.get('user-agent'),
        referer: request.headers.get('referer'),
      },
    });
  }

  return NextResponse.redirect(offer.checkout_url);
}
