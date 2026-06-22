import { getKiwifyCustomer, getKiwifyEventName, getKiwifyProduct, getKiwifySubscription, getKiwifyToken, mapKiwifyStatus, type KiwifyPayload } from '@/lib/kiwify/events';

export const dynamic = 'force-dynamic';

type ProcessingResult = { ok: boolean; error?: string; profileId?: string; subscriptionId?: string };

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase_env_missing');
  return { url: url.replace(/\/$/, ''), key };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

async function upsertProfile(email: string, name?: string, phone?: string) {
  const basePayload: Record<string, string> = { email, role: 'student' };
  if (name) basePayload.name = name;
  const fullPayload: Record<string, string> = { ...basePayload };
  if (phone) fullPayload.whatsapp = phone;

  async function attempt(payload: Record<string, string>) {
    const response = await supabaseRequest('profiles?on_conflict=email&select=id', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    return { response, data };
  }

  const first = await attempt(fullPayload);
  if (first.response.ok && Array.isArray(first.data) && first.data[0]?.id) return { id: first.data[0].id as string };

  const second = await attempt(basePayload);
  if (second.response.ok && Array.isArray(second.data) && second.data[0]?.id) return { id: second.data[0].id as string };

  return { error: JSON.stringify(second.data || first.data || { status: second.response.status }) };
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

async function safeLog(row: Record<string, unknown>) {
  try {
    await supabaseRequest('kiwify_webhook_events', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch {
    // Optional diagnostics table. Never fail the webhook because of logging.
  }
}

async function processSubscription(payload: KiwifyPayload): Promise<ProcessingResult> {
  const eventName = getKiwifyEventName(payload);
  const customer = getKiwifyCustomer(payload);
  const product = getKiwifyProduct(payload);
  const subscription = getKiwifySubscription(payload);
  const status = mapKiwifyStatus(eventName, subscription.status);
  const email = customer.email;
  if (!email) return { ok: false, error: 'customer_email_missing' };

  const profile = await upsertProfile(email, customer.name, customer.phone);
  if ('error' in profile || !profile.id) return { ok: false, error: profile.error || 'profile_error' };

  const providerSubscriptionId = subscription.id || subscription.orderId || `${email}:kiwify`;
  const response = await supabaseRequest('subscriptions?on_conflict=provider_subscription_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      profile_id: profile.id,
      provider: 'kiwify',
      provider_customer_id: email,
      provider_subscription_id: providerSubscriptionId,
      product_name: product.name || product.id || 'Kiwify',
      status,
      current_period_end: subscription.currentPeriodEnd || null,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => 'subscription_error');
    return { ok: false, error: detail, profileId: profile.id, subscriptionId: providerSubscriptionId };
  }

  return { ok: true, profileId: profile.id, subscriptionId: providerSubscriptionId };
}

export async function GET(request: Request) {
  try {
    supabaseConfig();
    return json({
      ok: true,
      service: 'Hub Foco em Canto Kiwify Webhook',
      method: 'POST',
      webhook_url: `${new URL(request.url).origin}/api/kiwify/webhook`,
      status: 'ready',
    });
  } catch (error) {
    return json({ ok: false, service: 'Hub Foco em Canto Kiwify Webhook', error: error instanceof Error ? error.message : 'config_error' }, 200);
  }
}

export async function POST(request: Request) {
  const { payload, raw } = await parsePayload(request);
  const eventName = getKiwifyEventName(payload);
  const customer = getKiwifyCustomer(payload);
  const product = getKiwifyProduct(payload);
  const subscription = getKiwifySubscription(payload);
  const status = mapKiwifyStatus(eventName, subscription.status);

  if (!isAuthorized(request, payload)) {
    await safeLog({ event_name: eventName, customer_email: customer.email, product_name: product.name, status: 'unauthorized', raw_payload: payload, raw_body: raw });
    return json({ ok: false, error: 'unauthorized_webhook' }, 200);
  }

  let result: ProcessingResult;
  try {
    result = await processSubscription(payload);
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : 'unknown_error' };
  }

  await safeLog({
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

  return json({ ok: result.ok, event: eventName, email: customer.email, product: product.name, status, subscription_id: result.subscriptionId, error: result.error }, 200);
}
