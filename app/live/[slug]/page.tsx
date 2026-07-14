import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import FocoLiveRoom from './room';
import OfferRuntimeFix from './offer-runtime-fix';
import './room.css';
import './host-studio.css';

export const dynamic = 'force-dynamic';

export default async function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: live } = await supabase
    .from('live_sessions')
    .select('id,title,description,status,access_type,guest_access_enabled,guest_fields,starts_at,current_scene,offer_config')
    .eq('slug', slug)
    .maybeSingle();

  if (!live) notFound();

  const { data: linked } = await supabase
    .from('live_session_offers')
    .select('sort_order, offer:live_offers(id,name,headline,description,price,old_price,checkout_url,cta_label,image_url,badge)')
    .eq('live_session_id', live.id)
    .order('sort_order');

  const offers = (linked || [])
    .map((item: any) => item.offer)
    .filter(Boolean)
    .map((offer: any) => ({
      ...offer,
      checkout_url: `/api/live/${slug}/offer-click/${offer.id}`,
    }));

  const persistedOffer = live.offer_config?.offer
    ? {
        ...live.offer_config.offer,
        checkout_url: `/api/live/${slug}/offer-click/${live.offer_config.offer.id}`,
      }
    : null;

  return (
    <>
      <OfferRuntimeFix slug={slug} />
      <FocoLiveRoom
        slug={slug}
        initialLive={{
          ...live,
          offer_config: live.offer_config
            ? { ...live.offer_config, offer: persistedOffer }
            : {},
          offers,
        }}
      />
    </>
  );
}
