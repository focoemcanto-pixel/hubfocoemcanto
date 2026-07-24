import { createAdminClient } from '@/lib/supabase/admin';
import FocoLiveDashboard from './foco-live-dashboard';
import './admin-hub.css';

export const dynamic = 'force-dynamic';

type LiveRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  access_type: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  guest_access_enabled: boolean;
  replay_enabled: boolean;
  replay_is_current: boolean;
  replay_status: string;
  replay_published_at: string | null;
  drive_file_id: string | null;
};

export default async function FocoLiveAdminPage() {
  const supabase = createAdminClient();
  const staleBefore = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  // Corrige sessões que ficaram presas como "ao vivo" após a sala ter sido encerrada.
  await supabase
    .from('live_sessions')
    .update({ status: 'ended', ends_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('status', 'live')
    .lt('created_at', staleBefore);

  const { data } = await supabase
    .from('live_sessions')
    .select('id,title,slug,status,access_type,starts_at,ends_at,created_at,guest_access_enabled,replay_enabled,replay_is_current,replay_status,replay_published_at,drive_file_id')
    .order('created_at', { ascending: false })
    .limit(100);

  return <FocoLiveDashboard lives={(data || []) as LiveRow[]} />;
}
