export type KiwifyEventType =
  | 'order.paid'
  | 'order.approved'
  | 'subscription.paid'
  | 'subscription.renewed'
  | 'subscription.canceled'
  | 'subscription.late'
  | 'subscription.overdue'
  | 'order.refunded'
  | 'chargeback.created'
  | string;

export type KiwifyPayload = {
  event?: KiwifyEventType;
  type?: KiwifyEventType;
  webhook_event_type?: KiwifyEventType;
  token?: string;
  customer?: { name?: string; email?: string; phone?: string; mobile?: string };
  subscription?: { id?: string; status?: string; current_period_end?: string; next_payment?: string; end_date?: string };
  product?: { id?: string; name?: string };
  order?: { id?: string; status?: string; created_at?: string };
  data?: {
    event?: KiwifyEventType;
    type?: KiwifyEventType;
    token?: string;
    customer?: { name?: string; email?: string; phone?: string; mobile?: string };
    subscription?: { id?: string; status?: string; current_period_end?: string; next_payment?: string; end_date?: string };
    product?: { id?: string; name?: string };
    order?: { id?: string; status?: string; created_at?: string };
    customer_email?: string;
    customer_name?: string;
    customer_phone?: string;
    product_name?: string;
    product_id?: string;
    subscription_id?: string;
    order_id?: string;
    status?: string;
    current_period_end?: string;
    next_payment?: string;
  };
  [key: string]: any;
};

function pick(...values: unknown[]) {
  return values.find((value) => typeof value === 'string' && value.trim()) as string | undefined;
}

function searchDeep(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = pick(record[key]);
    if (direct) return direct;
  }
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') {
      const found = searchDeep(nested, keys);
      if (found) return found;
    }
  }
  return undefined;
}

export function getKiwifyEventName(payload: KiwifyPayload) {
  return pick(payload.event, payload.type, payload.webhook_event_type, payload.data?.event, payload.data?.type, searchDeep(payload, ['event_type', 'webhook_event_type', 'event', 'type', 'name'])) || 'unknown';
}

export function getKiwifyCustomer(payload: KiwifyPayload) {
  const customer = payload.customer || payload.data?.customer || {};
  return {
    name: pick(customer.name, payload.data?.customer_name, searchDeep(payload, ['customer_name', 'full_name', 'buyer_name', 'name'])),
    email: pick(customer.email, payload.data?.customer_email, searchDeep(payload, ['customer_email', 'buyer_email', 'email']))?.toLowerCase(),
    phone: pick(customer.phone, customer.mobile, payload.data?.customer_phone, searchDeep(payload, ['customer_phone', 'phone', 'mobile', 'whatsapp'])),
  };
}

export function getKiwifyProduct(payload: KiwifyPayload) {
  const product = payload.product || payload.data?.product || {};
  return {
    id: pick(product.id, payload.data?.product_id, searchDeep(payload, ['product_id'])),
    name: pick(product.name, payload.data?.product_name, searchDeep(payload, ['product_name', 'product_title'])),
  };
}

export function getKiwifySubscription(payload: KiwifyPayload) {
  const subscription = payload.subscription || payload.data?.subscription || {};
  const order = payload.order || payload.data?.order || {};
  return {
    id: pick(subscription.id, payload.data?.subscription_id, order.id, payload.data?.order_id, searchDeep(payload, ['subscription_id'])),
    orderId: pick(order.id, payload.data?.order_id, searchDeep(payload, ['order_id', 'sale_id', 'transaction_id'])),
    status: pick(subscription.status, order.status, payload.data?.status, searchDeep(payload, ['subscription_status', 'order_status', 'status'])),
    currentPeriodEnd: pick(subscription.current_period_end, subscription.next_payment, subscription.end_date, payload.data?.current_period_end, payload.data?.next_payment, searchDeep(payload, ['current_period_end', 'next_payment', 'due_date', 'end_date'])),
  };
}

export function getKiwifyToken(payload: KiwifyPayload) {
  return pick(payload.token, payload.data?.token, searchDeep(payload, ['token', 'webhook_token']));
}

export function mapKiwifyStatus(eventName: string, explicitStatus?: string) {
  const event = eventName.toLowerCase();
  const status = String(explicitStatus || '').toLowerCase();
  if (['active', 'paid', 'approved', 'completed', 'authorized'].includes(status)) return 'active';
  if (['late', 'overdue', 'delayed', 'payment_failed', 'past_due', 'inadimplente', 'atrasada', 'atrasado'].includes(status)) return 'late';
  if (['canceled', 'cancelled', 'refunded', 'chargeback', 'blocked', 'inactive', 'expired'].includes(status)) return 'inactive';
  if (['waiting_payment', 'pending', 'trial', 'processing', 'boleto_generated', 'pix_generated'].includes(status)) return 'pending';
  if (event.includes('paid') || event.includes('approved') || event.includes('renewed') || event.includes('activated') || event.includes('compra aprovada')) return 'active';
  if (event.includes('late') || event.includes('overdue') || event.includes('atras') || event.includes('inadimpl') || event.includes('payment_failed') || event.includes('recus')) return 'late';
  if (event.includes('cancel') || event.includes('refund') || event.includes('reembolso') || event.includes('chargeback') || event.includes('expired') || event.includes('blocked')) return 'inactive';
  return 'pending';
}
