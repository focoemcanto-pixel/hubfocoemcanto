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
  guest_access_enabled: boolean;
};

export default async function FocoLiveAdminPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('live_sessions')
    .select('id,title,slug,status,access_type,starts_at,guest_access_enabled')
    .order('created_at', { ascending: false })
    .limit(100);

  return <FocoLiveDashboard lives={(data || []) as LiveRow[]} />;
}
