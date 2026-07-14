import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import FocoLiveRoom from './room';
import './room.css';

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

  return <FocoLiveRoom slug={slug} initialLive={live} />;
}
