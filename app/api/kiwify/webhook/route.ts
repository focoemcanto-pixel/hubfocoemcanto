import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKiwifyEventName, mapKiwifyStatus, type KiwifyPayload } from '@/lib/kiwify/events';

export const runtime = 'edge';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function isAuthorized(request: Request) {
  const secret = process.env.KIWIFY_WEBHOOK_SECRET;
  if (!secret) return true;

  const headerSecret =
    request.headers.get('x-webhook-secret') ||
    request.headers.get('x-kiwify-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');

  return headerSecret === secret || querySecret === secret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized webhook' }, { status: 401 });
  }

  const payload = (await request.json()) as KiwifyPayload;
  const eventName = getKiwifyEventName(payload);
  const status = mapKiwifyStatus(eventName);
  const email = payload.customer?.email?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'customer email missing' }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        email,
        name: payload.customer?.name,
        whatsapp: payload.customer?.phone,
      },
      { onConflict: 'email' }
    )
    .select('id')
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: profileError?.message || 'profile error' }, { status: 500 });
  }

  const { error: subscriptionError } = await supabase.from('subscriptions').upsert(
    {
      profile_id: profile.id,
      provider: 'kiwify',
      provider_customer_id: email,
      provider_subscription_id: payload.subscription?.id || payload.order?.id || email,
      product_name: payload.product?.name,
      status,
      current_period_end: payload.subscription?.current_period_end,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider_subscription_id' }
  );

  if (subscriptionError) {
    return NextResponse.json({ error: subscriptionError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: eventName, status });
}
