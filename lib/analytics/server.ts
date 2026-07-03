import { cookies, headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export type AnalyticsEventName =
  | 'page_view'
  | 'signup_free'
  | 'login'
  | 'feed_open'
  | 'community_open'
  | 'library_open'
  | 'premium_block'
  | 'checkout_open'
  | 'purchase'
  | 'renewal'
  | 'cancel'
  | 'duet_posted'
  | 'lesson_completed'
  | 'exercise_completed';

type TrackInput = {
  event: AnalyticsEventName | string;
  profileId?: string | null;
  email?: string | null;
  screen?: string | null;
  product?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isMissingAnalyticsTable(error?: { message?: string } | null) {
  const value = String(error?.message || '').toLowerCase();
  return value.includes('analytics_events') || value.includes('schema cache') || value.includes('does not exist') || value.includes('relation') || value.includes('42p01');
}

export async function currentAnalyticsProfile() {
  const email = (await cookies()).get('hub_access_email')?.value?.trim().toLowerCase() || null;
  if (!email) return { email: null, profileId: null };
  const supabase = createAdminClient();
  const { data } = await supabase.from('profiles').select('id,email').eq('email', email).maybeSingle();
  return { email, profileId: data?.id || null };
}

export async function trackAnalyticsEvent(input: TrackInput) {
  try {
    const supabase = createAdminClient();
    const fallback = await currentAnalyticsProfile().catch(() => ({ email: null, profileId: null }));
    const headerStore = await headers().catch(() => null as any);
    const payload = {
      profile_id: input.profileId || fallback.profileId || null,
      email: String(input.email || fallback.email || '').trim().toLowerCase() || null,
      event: String(input.event || '').trim(),
      screen: input.screen || null,
      product: input.product || null,
      source: input.source || null,
      metadata: {
        ...(input.metadata || {}),
        user_agent: headerStore?.get?.('user-agent') || undefined,
        referer: headerStore?.get?.('referer') || undefined,
      },
    };
    if (!payload.event) return { ok: false, skipped: true };
    const { error } = await supabase.from('analytics_events').insert(payload);
    if (error && !isMissingAnalyticsTable(error)) console.warn('[analytics] insert failed', error.message);
    return { ok: !error, error: error?.message || null };
  } catch (error) {
    console.warn('[analytics] failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'unknown_error' };
  }
}
