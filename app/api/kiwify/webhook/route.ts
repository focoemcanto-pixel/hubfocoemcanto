import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKiwifyCustomer, getKiwifyEventName, getKiwifyProduct, getKiwifySubscription, getKiwifyToken, mapKiwifyStatus, type KiwifyPayload } from '@/lib/kiwify/events';

export const runtime = 'edge';

type ProcessingResult = { ok: boolean; error?: string; profileId?: string; subscriptionId?: string };

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

function isAuthorized(request: Request, payload: KiwifyPayload) {
  const secret = process.env.KIWIFY_WEBHOOK_SECRET;
  if (!secret) return true;
  const headerSecret = request.headers.get('x-webhook-secret') || request.headers.get('x-kiwify-secret') || request.headers.get('x-kiwify-token') || request.headers.get('token') || request.headers.get('authorization')?.replace('Bearer ', '');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || url.searchParams.get('token');
  const bodyToken = getKiwifyToken(payload);
  return headerSecret === secret || querySecret === secret || bodyToken === secret;
}

async function parsePayload(request: Request): Promise<{ payload: KiwifyPayload; raw: string }> {
  const raw = await request.text();
  if (!raw) return { payload: {}, raw: '' };
  try {
    return { payload: JSON.parse(raw), raw };
  } catch {
    return { payload: Object.fromEntries(new URLSearchParams(raw)) as KiwifyPayload, raw };
  }
}

async function safeLog(supabase: ReturnType<typeof getAdminClient>, row: Record<string, unknown>) {
  try {
    await supabase.from('kiwify_webhook_events').insert(row);
  } catch {
    // Log table is optional. Never fail Kiwify because of logging.
  }
}

async function upsertProfile(supabase: ReturnType<typeof getAdminClient>, email: string, name?: string, phone?: string) {
  const basePayload: Record<string, string> = { email, role: 'student' };
  if (name) basePayload.name = name;
  const fullPayload: Record<string, string> = { ...basePayload };
  if (phone) fullPayload.whatsapp = phone;

  const first = await supabase.from('profiles').upsert(fullPayload, { onConflict: 'email' }).select('id').single();
  if (!first.error && first.data) return first;

  // Some older schemas do not have whatsapp. Fallback keeps the webhook working.
  return supabase.from('profiles').upsert(basePayload, { onConflict: 'email' }).select('id').single();
}

async function processSubscription(payload: KiwifyPayload): Promise<ProcessingResult> {
  const eventName = getKiwifyEventName(payload);
  const customer = getKiwifyCustomer(payload);
  const product = getKiwifyProduct(payload);
  const subscription = getKiwifySubscription(payload);
  const status = mapKiwifyStatus(eventName, subscription.status);
  const email = customer.email;
  if (!email) return { ok: false, error: 'customer_email_missing' };

  const supabase = getAdminClient();
  const { data: profile, error: profileError } = await upsertProfile(supabase, email, customer.name, customer.phone);
  if (profileError || !profile) return { ok: false, error: profileError?.message || 'profile_error' };

  const providerSubscriptionId = subscription.id || subscription.orderId || `${email}:kiwify`;
  const { error } = await supabase.from('subscriptions').upsert(
    {
      profile_id: profile.id,
      provider: 'kiwify',
      provider_customer_id: email,
      provider_subscription_id: providerSubscriptionId,
      product_name: product.name || product.id || 'Kiwify',
      status,
      current_period_end: subscription.currentPeriodEnd || null,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider_subscription_id' }
  );

  if (error) return { ok: false, error: error.message, profileId: profile.id, subscriptionId: providerSubscriptionId };
  return { ok: true, profileId: profile.id, subscriptionId: providerSubscriptionId };
}

export async function GET(request: Request) {
  return NextResponse.json({
    ok: true,
    service: 'Hub Foco em Canto Kiwify Webhook',
    method: 'POST',
    webhook_url: `${new URL(request.url).origin}/api/kiwify/webhook`,
    needs_sql: ['subscriptions', 'kiwify_webhook_events'],
  });
}

export async function POST(request: Request) {
  const { payload, raw } = await parsePayload(request);
  const eventName = getKiwifyEventName(payload);
  const customer = getKiwifyCustomer(payload);
  const product = getKiwifyProduct(payload);
  const subscription = getKiwifySubscription(payload);
  const status = mapKiwifyStatus(eventName, subscription.status);
  const supabase = getAdminClient();

  if (!isAuthorized(request, payload)) {
    await safeLog(supabase, { event_name: eventName, customer_email: customer.email, product_name: product.name, status: 'unauthorized', raw_payload: payload, raw_body: raw });
    return NextResponse.json({ ok: false, error: 'unauthorized_webhook' }, { status: 401 });
  }

  const result = await processSubscription(payload);
  await safeLog(supabase, {
    event_name: eventName,
    customer_email: customer.email,
    product_name: product.name,
    provider_subscription_id: result.subscriptionId || subscription.id || subscription.orderId,
    mapped_status: status,
    status: result.ok ? 'processed' : 'failed',
    error_message: result.error || null,
    raw_payload: payload,
    raw_body: raw,
  });

  // Return 200 even when DB schema is missing, so Kiwify test can confirm the endpoint is reachable.
  // The response body still shows the real processing error.
  return NextResponse.json({ ok: result.ok, event: eventName, email: customer.email, product: product.name, status, subscription_id: result.subscriptionId, error: result.error });
}
