import { AdminPremiumManager } from '@/components/admin-premium-manager';
import { createAdminClient } from '@/lib/supabase/admin';
import { courseKeyFromProduct, courseLabelFromKey } from '@/lib/access/products';

export const dynamic = 'force-dynamic';

type Subscription = {
  id?: string;
  status?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  product_name?: string | null;
  course_key?: string | null;
  updated_at?: string | null;
  provider_customer_id?: string | null;
  raw_payload?: any;
  profiles?: any;
};

type KiwifyLog = { id?: string; event_name?: string | null; customer_email?: string | null; product_name?: string | null; mapped_status?: string | null; status?: string | null; error_message?: string | null; created_at?: string | null };

const FALLBACK_NET_TICKET = 18.31;

function relatedProfile(value: unknown) { return Array.isArray(value) ? value[0] || null : value || null; }
function normalizeDate(value?: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function isActive(subscription?: Subscription | null) { return String(subscription?.status || '').toLowerCase() === 'active'; }
function addMonths(date: Date, months: number) { const copy = new Date(date); const day = copy.getDate(); copy.setMonth(copy.getMonth() + months); if (copy.getDate() < day) copy.setDate(0); return copy; }
function effectiveRenewalDate(subscription?: Subscription | null) {
  const officialEnd = normalizeDate(subscription?.current_period_end);
  const start = normalizeDate(subscription?.current_period_start) || normalizeDate(subscription?.updated_at);
  const base = officialEnd || start;
  if (!base) return { date: null as Date | null, estimated: false };
  if (!isActive(subscription)) return { date: base, estimated: false };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const renewal = new Date(base);
  if (renewal >= today) return { date: renewal, estimated: false };
  let estimated = new Date(renewal); let guard = 0;
  while (estimated < today && guard < 80) { estimated = addMonths(estimated, 1); guard += 1; }
  return { date: estimated, estimated: true };
}
function dateLabel(value?: string | null) { const date = normalizeDate(value); return date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : 'Sem data'; }
function dateLabelFromDate(date?: Date | null) { return date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : 'Sem data'; }
function money(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0); }
function daysUntilDate(date?: Date | null) { if (!date) return null; const start = new Date(); start.setHours(0, 0, 0, 0); const target = new Date(date); target.setHours(0, 0, 0, 0); return Math.ceil((target.getTime() - start.getTime()) / 86400000); }
function renewalLabel(date?: Date | null, estimated = false) { const days = daysUntilDate(date); if (days === null) return 'sem data de renovação'; const prefix = estimated ? 'estimada · ' : ''; if (days < 0) return `${prefix}vencido há ${Math.abs(days)} dias`; if (days === 0) return `${prefix}renova hoje`; if (days === 1) return `${prefix}renova amanhã`; return `${prefix}renova em ${days} dias`; }
function accessStatus(subscription?: Subscription | null) {
  if (!subscription) return { label: 'sem assinatura', tone: 'neutral', active: false, remove: true, action: 'verificar' };
  const status = String(subscription.status || 'pending').toLowerCase();
  if (status === 'active') return { label: 'ativo', tone: 'active', active: true, remove: false, action: 'manter acesso' };
  if (status === 'late' || status === 'overdue' || status === 'past_due') return { label: 'atrasado', tone: 'late', active: false, remove: false, action: 'cobrar renovação' };
  if (status === 'pending') return { label: 'pendente', tone: 'pending', active: false, remove: false, action: 'aguardar pagamento' };
  return { label: 'inativo', tone: 'danger', active: false, remove: true, action: 'bloquear acesso' };
}
function renewalTone(subscription?: Subscription | null) { if (!subscription) return 'danger'; const state = accessStatus(subscription); if (!state.active) return state.tone; const { date } = effectiveRenewalDate(subscription); const days = daysUntilDate(date); if (days === null) return 'pending'; if (days < 0) return 'review'; if (days <= 2) return 'late'; if (days <= 7) return 'pending'; return 'active'; }
function whatsappLink(_phone?: string | null) { return null; }
function eventTone(log?: KiwifyLog | null) { const event = String(log?.event_name || '').toLowerCase(); const status = String(log?.status || '').toLowerCase(); const mapped = String(log?.mapped_status || '').toLowerCase(); if (status === 'unauthorized' || status === 'failed') return 'danger'; if (mapped === 'active' || event.includes('approved') || event.includes('renew')) return 'active'; if (mapped === 'late' || event.includes('late')) return 'late'; if (mapped === 'pending' || event.includes('billet') || event.includes('pix')) return 'pending'; if (event.includes('cancel') || event.includes('refund') || event.includes('reject')) return 'danger'; return 'neutral'; }
function eventLabel(log?: KiwifyLog | null) { if (!log) return 'sem webhook recebido'; const event = String(log.event_name || '').toLowerCase(); if (event.includes('approved')) return 'Compra aprovada'; if (event.includes('renew')) return 'Renovação recebida'; if (event.includes('billet')) return 'Boleto gerado'; if (event.includes('cancel')) return 'Cancelamento recebido'; return log.mapped_status === 'active' ? 'Acesso liberado' : 'Evento recebido'; }
function normalizeAmount(value: unknown) { if (value === null || value === undefined || value === '') return null; const number = Number(value); if (!Number.isFinite(number)) return null; return number > 100 ? number / 100 : number; }
function subscriptionAmount(subscription?: Subscription | null) { const raw = subscription?.raw_payload || {}; const candidates = [raw.net_amount, raw.netAmount, raw.commission_amount, raw.commissionAmount, raw.price, raw.amount, raw.value, raw.order?.price, raw.order?.amount, raw.subscription?.price]; for (const candidate of candidates) { const amount = normalizeAmount(candidate); if (amount !== null && amount > 0) return amount; } return isActive(subscription) ? FALLBACK_NET_TICKET : 0; }
function paymentMethod(subscription?: Subscription | null) { const raw = subscription?.raw_payload || {}; const method = String(raw.payment_method || raw.paymentMethod || raw.payment?.method || raw.order?.payment_method || '').toLowerCase(); if (method.includes('credit') || method.includes('card')) return 'Cartão'; if (method.includes('pix')) return 'PIX'; if (method.includes('boleto') || method.includes('billet')) return 'Boleto'; if (isActive(subscription)) return 'Recorrência'; return 'Pix vencido'; }
function accessReason(subscription?: Subscription | null) { const state = accessStatus(subscription); if (state.active) return 'Assinatura ou compra liberada'; if (state.tone === 'danger') return 'Compra cancelada / sem renovação'; if (state.tone === 'late') return 'Pagamento atrasado'; if (state.tone === 'pending') return 'Aguardando confirmação'; return 'Verificar acesso'; }
async function safeQuery(query: PromiseLike<{ data: any; error: any }>, fallback: any[] = []) { const { data, error } = await query; if (error) return fallback; return Array.isArray(data) ? data : fallback; }

export default async function AdminPremiumPage() {
  const supabase = createAdminClient();
  const subscriptions = (await safeQuery(supabase.from('subscriptions').select('id,status,current_period_start,current_period_end,product_name,course_key,provider_customer_id,updated_at,raw_payload,profiles(id,name,email,whatsapp,created_at)').order('updated_at', { ascending: false }).limit(3000))) as Subscription[];
  const logs = (await safeQuery(supabase.from('kiwify_webhook_events').select('id,event_name,customer_email,product_name,mapped_status,status,error_message,created_at').order('created_at', { ascending: false }).limit(30))) as KiwifyLog[];

  const logsByEmail = new Map<string, KiwifyLog>();
  for (const log of logs) { const email = String(log.customer_email || '').toLowerCase(); if (email && !logsByEmail.has(email)) logsByEmail.set(email, log); }

  const rows = subscriptions.map((subscription) => {
    const profile = relatedProfile(subscription.profiles);
    const email = String(profile?.email || subscription.provider_customer_id || 'sem-email').toLowerCase();
    const name = profile?.name || email.split('@')[0] || 'Sem nome';
    const student = { id: profile?.id || subscription.id || email, name, email, whatsapp: profile?.whatsapp || null };
    const state = accessStatus(subscription);
    const renewalInfo = effectiveRenewalDate(subscription);
    const tone = renewalTone(subscription);
    const lastEvent = logsByEmail.get(email) || null;
    const amount = subscriptionAmount(subscription);
    const method = paymentMethod(subscription);
    const courseKey = subscription.course_key || courseKeyFromProduct(subscription.product_name);
    return {
      key: `${student.id}-${subscription?.id || student.email}`,
      student,
      state,
      renewalTone: tone,
      renewalDate: renewalInfo.date?.toISOString() || null,
      renewalDateLabel: dateLabelFromDate(renewalInfo.date),
      renewalLabel: renewalLabel(renewalInfo.date, renewalInfo.estimated),
      accessReason: accessReason(subscription),
      amount,
      amountLabel: money(amount),
      method,
      productName: subscription?.product_name || 'Produto não informado',
      courseKey,
      courseLabel: courseLabelFromKey(courseKey),
      lastEventLabel: eventLabel(lastEvent),
      lastEventTone: eventTone(lastEvent),
      lastEventDate: lastEvent?.created_at ? dateLabel(lastEvent.created_at) : accessReason(subscription),
      whatsapp: whatsappLink(student.whatsapp),
      estimated: renewalInfo.estimated,
      updatedAt: subscription.updated_at || subscription.current_period_start || null,
    };
  });

  const removeEmails = rows.filter((row) => row.state.remove).map((row) => row.student.email).filter(Boolean).join('\n');
  const lateEmails = rows.filter((row) => row.state.tone === 'late').map((row) => row.student.email).filter(Boolean).join('\n');

  return (
    <main className="page admin-shell premium-admin-page premium-console">
      <section className="premium-console-hero compact-premium-hero">
        <div><p className="eyebrow">Assinaturas</p><h1>Central de receita</h1><p>Receita real por período, cursos, status e movimentações de acesso.</p></div>
        <div className="premium-console-actions"><a href="/admin">Voltar</a></div>
      </section>
      <AdminPremiumManager rows={rows} removeEmails={removeEmails} lateEmails={lateEmails} />
      <aside className="premium-panel premium-events-panel">
        <div className="section-heading compact"><div><p className="eyebrow">Kiwify</p><h2>Movimentações recentes</h2></div><span className="pill">{logs.length}</span></div>
        <div className="premium-event-timeline">
          {logs.length ? logs.map((log) => <article className={`premium-timeline-item ${eventTone(log)}`} key={log.id}><span /><div><strong>{eventLabel(log)}</strong><p>{log.customer_email || 'sem email'} · {courseLabelFromKey(courseKeyFromProduct(log.product_name))}</p><small>{log.error_message || dateLabel(log.created_at)}</small></div></article>) : <p className="muted">Nenhum webhook registrado ainda.</p>}
        </div>
      </aside>
    </main>
  );
}
