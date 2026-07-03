import { getKiwifyCustomer, getKiwifyEventName, getKiwifyProduct, getKiwifySubscription, getKiwifyToken, mapKiwifyStatus, type KiwifyPayload } from '@/lib/kiwify/events';
import { courseKeyFromProduct, type CourseKey } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

type ProcessingResult = { ok: boolean; error?: string; profileId?: string; subscriptionId?: string; courseKey?: CourseKey | 'outros' };

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

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function envList(name: string) {
  return String(process.env[name] || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function resolveCourseKey(productName?: string | null, productId?: string | null) {
  const nameKey = courseKeyFromProduct(productName);
  if (nameKey !== 'outros') return nameKey;
  const id = String(productId || '').trim().toLowerCase();
  if (!id) return courseKeyFromProduct(productName || productId);
  const envMap: Array<[CourseKey, string[]]> = [
    ['grupo-vip', envList('KIWIFY_GRUPO_VIP_PRODUCT_IDS')],
    ['foco-em-harmonia', envList('KIWIFY_FOCO_HARMONIA_PRODUCT_IDS')],
    ['foco-em-canto', envList('KIWIFY_FOCO_CANTO_PRODUCT_IDS')],
    ['foco-em-melismas', envList('KIWIFY_FOCO_MELISMAS_PRODUCT_IDS')],
    ['ebooks', envList('KIWIFY_EBOOKS_PRODUCT_IDS')],
  ];
  const found = envMap.find(([, ids]) => ids.includes(id));
  if (found) return found[0];
  return courseKeyFromProduct(`${productName || ''} ${productId || ''}`);
}

async function upsertProfile(emailInput: string, name?: string, phone?: string) {
  const email = normalizeEmail(emailInput);
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

async function upsertSubscription(payload: Record<string, unknown>, providerSubscriptionId: string) {
  const response = await supabaseRequest('subscriptions?on_conflict=provider_subscription_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  });
  if (response.ok) return { ok: true };

  const firstError = await response.text().catch(() => 'subscription_error');
  const selectResponse = await supabaseRequest(`subscriptions?provider_subscription_id=eq.${encodeURIComponent(providerSubscriptionId)}&select=id`);
  const existing = await selectResponse.json().catch(() => null);
  const existingId = Array.isArray(existing) ? existing[0]?.id : null;
  if (existingId) {
    const updateResponse = await supabaseRequest(`subscriptions?id=eq.${encodeURIComponent(existingId)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    if (updateResponse.ok) return { ok: true };
    const updateError = await updateResponse.text().catch(() => 'subscription_update_error');
    return { ok: false, error: updateError };
  }
  return { ok: false, error: firstError };
}

async function processSubscription(payload: KiwifyPayload): Promise<ProcessingResult> {
  const eventName = getKiwifyEventName(payload);
  const customer = getKiwifyCustomer(payload);
  const product = getKiwifyProduct(payload);
  const subscription = getKiwifySubscription(payload);
  const status = mapKiwifyStatus(eventName, subscription.status);
  const email = normalizeEmail(customer.email);
  if (!email) return { ok: false, error: 'customer_email_missing' };

  const profile = await upsertProfile(email, customer.name, customer.phone);
  if ('error' in profile || !profile.id) return { ok: false, error: profile.error || 'profile_error' };

  const productName = product.name || product.id || 'Kiwify';
  const courseKey = resolveCourseKey(productName, product.id);
  const providerSubscriptionId = subscription.id || subscription.orderId || `${email}:${courseKey}`;
  const subscriptionPayload = {
    profile_id: profile.id,
    provider: 'kiwify',
    provider_customer_id: email,
    provider_subscription_id: providerSubscriptionId,
    product_name: productName,
    source_product_name: productName,
    course_key: courseKey,
    status,
    current_period_end: subscription.currentPeriodEnd || null,
    raw_payload: payload,
    updated_at: new Date().toISOString(),
  };
  const result = await upsertSubscription(subscriptionPayload, providerSubscriptionId);

  if (!result.ok) {
    return { ok: false, error: result.error || 'subscription_error', profileId: profile.id, subscriptionId: providerSubscriptionId, courseKey };
  }

  return { ok: true, profileId: profile.id, subscriptionId: providerSubscriptionId, courseKey };
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
      products: ['Grupo VIP', 'Foco em Harmonia', 'Foco em Canto', 'Foco em Melismas', 'Ebooks'],
      vip_release_rule: 'Compra aprovada/paid/renewed + produto mapeado como grupo-vip => subscription active => acesso VIP liberado pelo e-mail.',
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
  const productName = product.name || product.id || 'Kiwify';
  const courseKey = resolveCourseKey(productName, product.id);

  if (!isAuthorized(request, payload)) {
    await safeLog({ event_name: eventName, customer_email: customer.email, product_name: productName, provider_subscription_id: subscription.id || subscription.orderId, mapped_status: status, status: 'unauthorized', error_message: 'unauthorized_webhook', raw_payload: payload, raw_body: raw });
    return json({ ok: false, error: 'unauthorized_webhook' }, 200);
  }

  let result: ProcessingResult;
  try {
    result = await processSubscription(payload);
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : 'unknown_error', courseKey };
  }

  await safeLog({
    event_name: eventName,
    customer_email: normalizeEmail(customer.email),
    product_name: productName,
    provider_subscription_id: result.subscriptionId || subscription.id || subscription.orderId,
    mapped_status: status,
    status: result.ok ? 'processed' : 'failed',
    error_message: result.error || null,
    raw_payload: payload,
    raw_body: raw,
  });

  return json({ ok: result.ok, event: eventName, email: normalizeEmail(customer.email), product: productName, course_key: result.courseKey || courseKey, status, subscription_id: result.subscriptionId, error: result.error }, 200);
}
