import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import LiveEditor from './live-editor';
import './live-editor.css';

export const dynamic = 'force-dynamic';

type LiveRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  access_type: string;
  guest_access_enabled: boolean;
  starts_at: string | null;
  recording_enabled: boolean;
  offer_config?: Record<string, unknown> | null;
};

export default async function FocoLiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await createAdminClient()
    .from('live_sessions')
    .select('id,title,slug,description,status,access_type,guest_access_enabled,starts_at,recording_enabled,offer_config')
    .eq('id', id)
    .maybeSingle();

  if (!data) notFound();
  return <LiveEditor initialLive={data as LiveRow} />;
}
