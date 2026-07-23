import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandingMetadata } from '@/lib/seo/branding-metadata';
import FocoLiveRoom from './room';
import SessionEndGuard from './session-end-guard';
import EndCleanupRuntime from './end-cleanup-runtime';
import PrejoinRuntime from './prejoin-runtime';
import LivePolishRuntime from './live-polish-runtime';
import ScreenShareFocusRuntime from './screen-share-focus-runtime';
import LivePianoRuntime from './live-piano-runtime';
import LiveToolsRuntime from './live-tools-runtime';
import LiveStudioRuntime from './live-studio-runtime';
import FocoBoardV2Runtime from './foco-board-v2-runtime';
import LiveMeetPresentationRuntime from './live-meet-presentation-runtime';
import LiveOffersDirectionRuntime from './live-offers-direction-runtime';
import LiveBoardTextFixRuntime from './live-board-text-fix-runtime';
import LiveCameraControlsRuntime from './live-camera-controls-runtime';
import LiveLocalRecordingRuntime from './live-local-recording-runtime';
import VoiceStudioKeyboardTransportRuntime from './voice-studio-keyboard-transport-runtime';
import VoiceStudioDawRuntime from './voice-studio-daw-runtime';
import VoiceStudioAddTrackRuntime from './voice-studio-add-track-runtime';
import VoiceStudioLayoutRuntime from './voice-studio-layout-runtime';
import VoiceStudioMidiRoutingRuntime from './voice-studio-midi-routing-runtime';
import VoiceStudioMonitorTransportRuntime from './voice-studio-monitor-transport-runtime';
import VoiceStudioMidiLivePreviewRuntime from './voice-studio-midi-live-preview-runtime';
import HandSignalRuntime from './hand-signal-runtime';
import './room.css';
import './host-studio.css';
import './split-offer-fix.css';
import './session-end.css';
import './offer-stage-integration.css';
import './prejoin-runtime.css';
import './live-polish.css';
import './polish-round-2.css';
import './mobile-responsive-v2.css';
import './live-piano.css';
import './live-tools.css';
import './live-device-selectors.css';
import './live-studio.css';
import './foco-board-v2.css';
import './live-camera-controls.css';
import './voice-studio-daw.css';
import './voice-studio-midi.css';
import './voice-studio-daw-runtime.css';
import './voice-studio-layout-runtime.css';
import './voice-studio-safe-track-runtime.css';
import './voice-studio-project-manager.css';
import './hand-signal.css';
import './room-shell-v2.css';

export const dynamic = 'force-dynamic';
type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [branding, liveResult] = await Promise.all([
    getBrandingMetadata(),
    createAdminClient().from('live_sessions').select('title,description,starts_at,offer_config').eq('slug', slug).maybeSingle(),
  ]);
  const live = liveResult.data;
  if (!live) return branding;
  const title = live.title || 'Foco Live';
  const description = live.description || 'Participe desta transmissão ao vivo pelo Foco em Canto.';
  const customImage = live.offer_config?.share_image_url as string | undefined;
  const fallbackImages = branding.openGraph?.images;
  const images = customImage ? [{ url: customImage, width: 1200, height: 630, alt: title }] : fallbackImages;
  return { ...branding, title, description, alternates: { canonical: `/live/${slug}` }, openGraph: { ...branding.openGraph, type: 'website', url: `/live/${slug}`, title, description, images }, twitter: { ...branding.twitter, card: 'summary_large_image', title, description, images: customImage ? [customImage] : branding.twitter?.images } };
}

export default async function LivePage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const [{ data: live }, { data: offerLibrary }] = await Promise.all([
    supabase.from('live_sessions').select('id,title,description,status,access_type,guest_access_enabled,guest_fields,starts_at,current_scene,offer_config,recording_enabled,waiting_room_locked').eq('slug', slug).maybeSingle(),
    supabase.from('live_offers').select('id,name,headline,description,price,old_price,checkout_url,cta_label,image_url,badge').eq('is_active', true).order('created_at', { ascending: false }),
  ]);
  if (!live) notFound();

  const offers = (offerLibrary || []).map((offer: any) => ({
    ...offer,
    direct_checkout_url: offer.checkout_url,
    checkout_url: `/api/live/${slug}/offer-click/${offer.id}`,
  }));
  const persistedOffer = live.offer_config?.offer ? {
    ...live.offer_config.offer,
    direct_checkout_url: live.offer_config.offer.direct_checkout_url || live.offer_config.offer.checkout_url,
    checkout_url: `/api/live/${slug}/offer-click/${live.offer_config.offer.id}`,
  } : null;

  return <>
    <SessionEndGuard initialStatus={live.status} title={live.title} slug={slug} />
    <EndCleanupRuntime />
    <PrejoinRuntime />
    <LivePolishRuntime />
    <ScreenShareFocusRuntime />
    <LivePianoRuntime />
    <LiveToolsRuntime />
    <LiveStudioRuntime />
    <FocoBoardV2Runtime />
    <LiveMeetPresentationRuntime />
    <LiveOffersDirectionRuntime />
    <LiveBoardTextFixRuntime />
    <LiveLocalRecordingRuntime />
    <VoiceStudioKeyboardTransportRuntime />
    <VoiceStudioDawRuntime />
    <VoiceStudioAddTrackRuntime />
    <VoiceStudioLayoutRuntime />
    <VoiceStudioMidiRoutingRuntime />
    <VoiceStudioMonitorTransportRuntime />
    <VoiceStudioMidiLivePreviewRuntime />
    <LiveCameraControlsRuntime />
    <HandSignalRuntime />
    <FocoLiveRoom slug={slug} initialLive={{ ...live, offer_config: live.offer_config ? { ...live.offer_config, offer: persistedOffer } : {}, offers }} />
  </>;
}
