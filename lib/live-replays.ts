import { createAdminClient } from '@/lib/supabase/admin';

type LiveSessionReplayRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  replay_custom_title: string | null;
  replay_custom_description: string | null;
  drive_file_id: string;
  video_mime_type: string | null;
  replay_status: string | null;
  replay_is_current: boolean | null;
  replay_expires_at: string | null;
  replay_published_at: string | null;
};

export type ReplayRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  drive_file_id: string;
  mime_type: string | null;
  status: string | null;
  is_current: boolean | null;
  available_until: string | null;
  published_at: string | null;
};

export type ReplayProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  price_cents: number | null;
  billing_type: string | null;
  redirect_url: string | null;
};

export async function getReplayBySlug(slug?: string): Promise<ReplayRow | null> {
  const supabase = createAdminClient();
  let query = supabase
    .from('live_sessions')
    .select('id,title,slug,description,replay_custom_title,replay_custom_description,drive_file_id,video_mime_type,replay_status,replay_is_current,replay_expires_at,replay_published_at')
    .eq('replay_enabled', true)
    .eq('replay_status', 'published')
    .not('drive_file_id', 'is', null);

  query = slug
    ? query.eq('slug', slug)
    : query.eq('replay_is_current', true).order('replay_published_at', { ascending: false }).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  const row = data as LiveSessionReplayRow;
  if (row.replay_expires_at && new Date(row.replay_expires_at).getTime() <= Date.now()) return null;

  return {
    id: row.id,
    title: row.replay_custom_title || row.title,
    slug: row.slug,
    description: row.replay_custom_description || row.description,
    drive_file_id: row.drive_file_id,
    mime_type: row.video_mime_type,
    status: row.replay_status,
    is_current: row.replay_is_current,
    available_until: row.replay_expires_at,
    published_at: row.replay_published_at,
  };
}

export async function getReplayProducts(): Promise<ReplayProduct[]> {
  const supabase = createAdminClient();
  const rich = await supabase
    .from('products')
    .select('id,name,slug,description,cover_url,price_cents,billing_type,redirect_url,sales_page_url,sales_url,external_url,status')
    .eq('status', 'published')
    .order('created_at', { ascending: true });

  if (!rich.error) {
    return (rich.data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      cover_url: item.cover_url,
      price_cents: item.price_cents,
      billing_type: item.billing_type,
      redirect_url: item.redirect_url || item.sales_page_url || item.sales_url || item.external_url || `/aluno/produtos/${item.slug}`,
    }));
  }

  const fallback = await supabase
    .from('products')
    .select('id,name,slug,description,cover_url,price_cents,billing_type,status')
    .eq('status', 'published')
    .order('created_at', { ascending: true });

  return (fallback.data || []).map((item: any) => ({ ...item, redirect_url: `/aluno/produtos/${item.slug}` }));
}
