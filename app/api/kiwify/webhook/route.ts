import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKiwifyCustomer, getKiwifyEventName, getKiwifyProduct, getKiwifySubscription, mapKiwifyStatus, type KiwifyPayload } from '@/lib/kiwify/events';

export const runtime = 'edge';

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

function isAuthorized(request: Request) {
  const secret = process.env.KIWIFY_WEBHOOK_SECRET;
  if (!secret) return true;
  const headerSecret = request.headers.get('x-webhook-secret') || request.headers.get('x-kiwify-secret') || request.headers.get('authorization')?.replace('Bearer ', '');
  const querySecret = new URL(request.url).searchParams.get('secret');
  return headerSecret === secret || querySecret === secret;
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'Hub Foco em Canto Kiwify Webhook', message: 'Esta rota recebe eventos POST da Kiwify.' });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'unauthorized webhook' }, { status: 401 });

  const payload = (await request.json()) as KiwifyPayload;
  const eventName = getKiwifyEventName(payload);
  const customer = getKiwifyCustomer(payload);
  const product = getKiwifyProduct(payload);
  const subscription = getKiwifySubscription(payload);
  const status = mapKiwifyStatus(eventName, subscription.status);
  const email = customer.email;
  if (!email) return NextResponse.json({ error: 'customer email missing' }, { status: 400 });

  const supabase = getAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert({ email, name: customer.name, whatsapp: customer.phone, role: 'student' }, { onConflict: 'email' })
    .select('id')
    .single();

  if (profileError || !profile) return NextResponse.json({ error: profileError?.message || 'profile error' }, { status: 500 });

  const subscriptionId = subscription.id || subscription.orderId || `${email}:kiwify`;
  const { error: subscriptionError } = await supabase.from('subscriptions').upsert(
    {
      profile_id: profile.id,
      provider: 'kiwify',
      provider_customer_id: email,
      provider_subscription_id: subscriptionId,
      product_name: product.name,
      status,
      current_period_end: subscription.currentPeriodEnd,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider_subscription_id' }
  );

  if (subscriptionError) return NextResponse.json({ error: subscriptionError.message }, { status: 500 });
  return NextResponse.json({ ok: true, event: eventName, email, status, subscription_id: subscriptionId });
}
