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
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  subscription?: {
    id?: string;
    status?: string;
    current_period_end?: string;
  };
  product?: {
    name?: string;
  };
  order?: {
    id?: string;
    status?: string;
  };
};

export function getKiwifyEventName(payload: KiwifyPayload) {
  return payload.event || payload.type || 'unknown';
}

export function mapKiwifyStatus(eventName: string) {
  const activeEvents = ['order.paid', 'order.approved', 'subscription.paid', 'subscription.renewed'];
  const inactiveEvents = ['subscription.canceled', 'order.refunded', 'chargeback.created'];

  if (activeEvents.includes(eventName)) return 'active';
  if (inactiveEvents.includes(eventName)) return 'inactive';
  return 'pending';
}
