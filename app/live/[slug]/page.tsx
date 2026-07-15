import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import FocoLiveRoom from './room';
import OfferRuntimeFix from './offer-runtime-fix';
import LiveUxFix from './live-ux-fix';
import DailyCallBridge from './daily-call-bridge';
import WaitingRoomRuntime from './waiting-room-runtime';
import SessionEndGuard from './session-end-guard';
import MeetStageRuntime from './meet-stage-runtime';
import PrejoinRuntime from './prejoin-runtime';
import LivePolishRuntime from './live-polish-runtime';
import MusicModeRuntime from './music-mode-runtime';
import './room.css';
import './host-studio.css';
import './split-offer-fix.css';
import './live-ux-fix.css';
import './waiting-room.css';
import './session-end.css';
import './meet-stage.css';
import './prejoin-runtime.css';
import './offer-stage-integration.css';
import './live-polish.css';
import './music-mode-runtime.css';

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
    .map((offer: any) => ({ ...offer, checkout_url: `/api/live/${slug}/offer-click/${offer.id}` }));

  const persistedOffer = live.offer_config?.offer
    ? { ...live.offer_config.offer, checkout_url: `/api/live/${slug}/offer-click/${live.offer_config.offer.id}` }
    : null;

  return (
    <>
      <DailyCallBridge />
      <PrejoinRuntime />
      <OfferRuntimeFix slug={slug} />
      <LiveUxFix slug={slug} />
      <WaitingRoomRuntime slug={slug} />
      <SessionEndGuard initialStatus={live.status} title={live.title} />
      <MeetStageRuntime />
      <LivePolishRuntime />
      <MusicModeRuntime />
      <FocoLiveRoom
        slug={slug}
        initialLive={{
          ...live,
          offer_config: live.offer_config ? { ...live.offer_config, offer: persistedOffer } : {},
          offers,
        }}
      />
    </>
  );
}
