import { createAdminClient } from '@/lib/supabase/admin';

type ReplayRow = {
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

export async function getReplayBySlug(slug?: string) {
  const supabase = createAdminClient();
  let query = supabase
    .from('live_replays')
    .select('id,title,slug,description,drive_file_id,mime_type,status,is_current,available_until,published_at')
    .eq('status', 'published');

  query = slug ? query.eq('slug', slug) : query.eq('is_current', true).order('published_at', { ascending: false }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data as ReplayRow | null;
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
