export type KiwifyEventType =
  | 'order.paid'
  | 'order.approved'
  | 'subscription.paid'
  | 'subscription.renewed'
  | 'subscription.canceled'
  | 'order.refunded'
  | 'chargeback.created'
  | string;

export type KiwifyPayload = {
  event?: KiwifyEventType;
  type?: KiwifyEventType;
  webhook_event_type?: KiwifyEventType;
  customer?: { name?: string; email?: string; phone?: string; mobile?: string };
  subscription?: { id?: string; status?: string; current_period_end?: string; next_payment?: string; end_date?: string };
  product?: { id?: string; name?: string };
  order?: { id?: string; status?: string; created_at?: string };
  data?: {
    event?: KiwifyEventType;
    type?: KiwifyEventType;
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
};

function pick(...values: unknown[]) {
  return values.find((value) => typeof value === 'string' && value.trim()) as string | undefined;
}

export function getKiwifyEventName(payload: KiwifyPayload) {
  return pick(payload.event, payload.type, payload.webhook_event_type, payload.data?.event, payload.data?.type) || 'unknown';
}

export function getKiwifyCustomer(payload: KiwifyPayload) {
  const customer = payload.customer || payload.data?.customer || {};
  return {
    name: pick(customer.name, payload.data?.customer_name),
    email: pick(customer.email, payload.data?.customer_email)?.toLowerCase(),
    phone: pick(customer.phone, customer.mobile, payload.data?.customer_phone),
  };
}

export function getKiwifyProduct(payload: KiwifyPayload) {
  const product = payload.product || payload.data?.product || {};
  return {
    id: pick(product.id, payload.data?.product_id),
    name: pick(product.name, payload.data?.product_name),
  };
}

export function getKiwifySubscription(payload: KiwifyPayload) {
  const subscription = payload.subscription || payload.data?.subscription || {};
  const order = payload.order || payload.data?.order || {};
  return {
    id: pick(subscription.id, payload.data?.subscription_id, order.id, payload.data?.order_id),
    orderId: pick(order.id, payload.data?.order_id),
    status: pick(subscription.status, order.status, payload.data?.status),
    currentPeriodEnd: pick(subscription.current_period_end, subscription.next_payment, subscription.end_date, payload.data?.current_period_end, payload.data?.next_payment),
  };
}

export function mapKiwifyStatus(eventName: string, explicitStatus?: string) {
  const event = eventName.toLowerCase();
  const status = String(explicitStatus || '').toLowerCase();
  if (['active', 'paid', 'approved', 'completed', 'authorized'].includes(status)) return 'active';
  if (['canceled', 'cancelled', 'refunded', 'chargeback', 'blocked', 'inactive', 'expired'].includes(status)) return 'inactive';
  if (['waiting_payment', 'pending', 'trial', 'processing'].includes(status)) return 'pending';
  if (event.includes('paid') || event.includes('approved') || event.includes('renewed') || event.includes('activated')) return 'active';
  if (event.includes('cancel') || event.includes('refund') || event.includes('chargeback') || event.includes('expired') || event.includes('blocked')) return 'inactive';
  return 'pending';
}
