import { courseKeyFromProduct, courseLabelFromKey } from '@/lib/access/products';

type Subscription = { status?: string | null; current_period_start?: string | null; updated_at?: string | null; product_name?: string | null; course_key?: string | null; raw_payload?: any };
type AnalyticsEvent = { event?: string | null; screen?: string | null; product?: string | null; email?: string | null; profile_id?: string | null; created_at?: string | null };

const FALLBACK_NET_TICKET = 18.31;
function startOfDay() { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }
function startOfWeek() { const date = startOfDay(); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return date; }
function startOfMonth() { const date = startOfDay(); date.setDate(1); return date; }
function asDate(value?: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function inRange(value: string | null | undefined, start: Date) { const date = asDate(value); return !!date && date >= start; }
function isActive(subscription?: Subscription | null) { return String(subscription?.status || '').toLowerCase() === 'active'; }
function amount(subscription?: Subscription | null) { const raw = subscription?.raw_payload || {}; const candidates = [raw.net_amount, raw.netAmount, raw.commission_amount, raw.commissionAmount, raw.price, raw.amount, raw.value, raw.order?.price, raw.order?.amount, raw.subscription?.price]; for (const candidate of candidates) { const value = Number(candidate); if (Number.isFinite(value) && value > 0) return value > 100 ? value / 100 : value; } return isActive(subscription) ? FALLBACK_NET_TICKET : 0; }
function count(events: AnalyticsEvent[], eventName: string) { return events.filter((event) => event.event === eventName).length; }
function unique(events: AnalyticsEvent[]) { return new Set(events.map((event) => event.profile_id || event.email).filter(Boolean)).size; }
function rate(part: number, total: number) { return total ? (part / total) * 100 : 0; }
function screenLabel(value?: string | null) { return String(value || 'Hub').replace('/aluno/', '').replaceAll('/', ' › ') || 'Hub'; }
function eventTone(event?: string | null) { if (event === 'purchase' || event === 'renewal') return 'active'; if (event === 'cancel') return 'danger'; return ''; }
function eventTitle(event?: string | null) { if (event === 'purchase') return 'Compra aprovada'; if (event === 'renewal') return 'Renovação recebida'; if (event === 'cancel') return 'Cancelamento'; if (event === 'premium_block') return 'Bloqueio VIP'; if (event === 'checkout_open') return 'Checkout aberto'; if (event === 'duet_posted') return 'Dueto publicado'; return event || 'Evento'; }

export function buildAdminPremiumMetrics(events: AnalyticsEvent[], subscriptions: Subscription[], base: any) {
  const today = startOfDay(); const week = startOfWeek(); const month = startOfMonth();
  const activeSubs = subscriptions.filter(isActive);
  const revenueToday = subscriptions.filter((item) => isActive(item) && inRange(item.updated_at || item.current_period_start, today)).reduce((sum, item) => sum + amount(item), 0);
  const revenueMonth = subscriptions.filter((item) => isActive(item) && inRange(item.updated_at || item.current_period_start, month)).reduce((sum, item) => sum + amount(item), 0);
  const mrr = activeSubs.reduce((sum, item) => sum + amount(item), 0);
  const purchases = count(events, 'purchase'); const checkoutOpen = count(events, 'checkout_open'); const premiumBlocks = count(events, 'premium_block'); const signupsFree = count(events, 'signup_free');
  const productsMap = new Map<string, { active: number; revenue: number; purchases: number }>();
  for (const sub of subscriptions) { const label = courseLabelFromKey(sub.course_key || courseKeyFromProduct(sub.product_name)); const row = productsMap.get(label) || { active: 0, revenue: 0, purchases: 0 }; if (isActive(sub)) { row.active += 1; row.revenue += amount(sub); } productsMap.set(label, row); }
  events.filter((event) => event.event === 'purchase').forEach((event) => { const label = courseLabelFromKey(event.product || 'outros'); const row = productsMap.get(label) || { active: 0, revenue: 0, purchases: 0 }; row.purchases += 1; productsMap.set(label, row); });
  const top = new Map<string, number>(); events.filter((event) => event.event === 'premium_block').forEach((event) => { const label = screenLabel(event.screen) || event.product || 'VIP'; top.set(label, (top.get(label) || 0) + 1); });
  const funnel = (base.funnel || []).map((item: any, index: number, list: any[]) => ({ ...item, rate: index === 0 ? 100 : rate(item.value, Math.max(1, list[index - 1]?.value || 0)) }));
  return {
    ...base,
    revenueToday,
    revenueMonth,
    mrr,
    activeSubscribers: activeSubs.length,
    newSubscriptions: subscriptions.filter((item) => isActive(item) && inRange(item.updated_at || item.current_period_start, month)).length,
    avgTicket: activeSubs.length ? mrr / activeSubs.length : 0,
    churnRate: rate(count(events, 'cancel'), Math.max(1, activeSubs.length + count(events, 'cancel'))),
    dau: unique(events.filter((event) => inRange(event.created_at, today))),
    wau: unique(events.filter((event) => inRange(event.created_at, week))),
    mau: unique(events),
    products: Array.from(productsMap.entries()).map(([label, value]) => ({ label, active: value.active, revenue: value.revenue, conversion: rate(value.purchases, Math.max(1, checkoutOpen)) })).sort((a, b) => b.revenue - a.revenue).slice(0, 6),
    topBlocked: Array.from(top.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })),
    funnel,
    recent: events.slice(0, 8).map((event) => ({ label: eventTitle(event.event), detail: `${event.email || 'aluno'} · ${event.screen || event.product || 'Hub'}`, tone: eventTone(event.event) })),
  };
}
