import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type SearchParams = { status?: string };

type Subscription = {
  id?: string;
  status?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  product_name?: string | null;
  provider?: string | null;
  updated_at?: string | null;
  provider_customer_id?: string | null;
  profiles?: any;
};

type KiwifyLog = {
  id?: string;
  event_name?: string | null;
  customer_email?: string | null;
  product_name?: string | null;
  mapped_status?: string | null;
  status?: string | null;
  error_message?: string | null;
  created_at?: string | null;
};

function relatedProfile(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value?: string | null) {
  const date = normalizeDate(value);
  if (!date) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function daysUntil(value?: string | null) {
  const date = normalizeDate(value);
  if (!date) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

function renewalLabel(value?: string | null) {
  const days = daysUntil(value);
  if (days === null) return 'sem data de renovacao';
  if (days < 0) return `data antiga ha ${Math.abs(days)} dias`;
  if (days === 0) return 'renova hoje';
  if (days === 1) return 'renova amanha';
  return `renova em ${days} dias`;
}

function accessStatus(subscription?: Subscription | null) {
  if (!subscription) return { label: 'sem assinatura', tone: 'neutral', active: false, remove: true, action: 'verificar' };
  const status = String(subscription.status || 'pending').toLowerCase();
  if (status === 'active') return { label: 'ativo', tone: 'active', active: true, remove: false, action: 'manter no grupo' };
  if (status === 'late') return { label: 'atrasado', tone: 'late', active: false, remove: false, action: 'cobrar renovacao' };
  if (status === 'pending') return { label: 'pendente', tone: 'pending', active: false, remove: false, action: 'aguardar pagamento' };
  return { label: status || 'inativo', tone: 'danger', active: false, remove: true, action: 'tirar do grupo' };
}

function renewalTone(subscription?: Subscription | null) {
  if (!subscription) return 'danger';
  const state = accessStatus(subscription);
  if (!state.active) return state.tone;
  const days = daysUntil(subscription.current_period_end);
  if (days === null) return 'pending';
  if (days < 0) return 'review';
  if (days <= 2) return 'late';
  if (days <= 7) return 'pending';
  return 'active';
}

function whatsappLink(phone?: string | null, name?: string | null, state?: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const message = state === 'late'
    ? `Oi ${name || ''}, tudo bem? Vi que sua assinatura do Grupo VIP esta atrasada. Quer que eu te envie o link para regularizar?`
    : `Oi ${name || ''}, tudo bem? Estou conferindo seu acesso ao Grupo VIP Foco em Harmonia.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function normalizeFilter(value?: string) {
  const allowed = ['todos', 'ativos', 'vencendo', 'revisar', 'atrasados', 'pendentes', 'remover'];
  return allowed.includes(String(value)) ? String(value) : 'todos';
}

function eventTone(log?: KiwifyLog | null) {
  const event = String(log?.event_name || '').toLowerCase();
  const status = String(log?.status || '').toLowerCase();
  const mapped = String(log?.mapped_status || '').toLowerCase();
  if (status === 'unauthorized' || status === 'failed') return 'danger';
  if (mapped === 'active' || event.includes('approved') || event.includes('renew')) return 'active';
  if (mapped === 'late' || event.includes('late')) return 'late';
  if (mapped === 'pending' || event.includes('billet') || event.includes('pix')) return 'pending';
  if (event.includes('cancel') || event.includes('refund') || event.includes('reject')) return 'danger';
  return 'neutral';
}

function eventLabel(log?: KiwifyLog | null) {
  if (!log) return 'sem webhook recebido';
  return log.event_name || log.mapped_status || log.status || 'evento recebido';
}

async function safeQuery(query: PromiseLike<{ data: any; error: any }>, fallback: any[] = []) {
  const { data, error } = await query;
  if (error) return fallback;
  return Array.isArray(data) ? data : fallback;
}

export default async function AdminPremiumPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = await searchParams;
  const currentFilter = normalizeFilter(params?.status);
  const supabase = createAdminClient();

  const subscriptions = (await safeQuery(
    supabase
      .from('subscriptions')
      .select('id,status,current_period_start,current_period_end,product_name,provider,provider_customer_id,updated_at,profiles(id,name,email,whatsapp,created_at)')
      .order('updated_at', { ascending: false })
      .limit(1000)
  )) as Subscription[];

  const logs = (await safeQuery(
    supabase
      .from('kiwify_webhook_events')
      .select('id,event_name,customer_email,product_name,mapped_status,status,error_message,created_at')
      .order('created_at', { ascending: false })
      .limit(30)
  )) as KiwifyLog[];

  const logsByEmail = new Map<string, KiwifyLog>();
  for (const log of logs) {
    const email = String(log.customer_email || '').toLowerCase();
    if (email && !logsByEmail.has(email)) logsByEmail.set(email, log);
  }

  const rows = (subscriptions || []).map((subscription: Subscription) => {
    const profile = relatedProfile(subscription.profiles);
    const email = String(profile?.email || subscription.provider_customer_id || 'sem-email').toLowerCase();
    const name = profile?.name || email.split('@')[0] || 'Sem nome';
    const student = { id: profile?.id || subscription.id || email, name, email, whatsapp: profile?.whatsapp || null };
    const state = accessStatus(subscription);
    const renewal = renewalTone(subscription);
    const lastEvent = logsByEmail.get(email) || null;
    return { student, subscription, state, renewal, lastEvent, whatsapp: whatsappLink(student.whatsapp, student.name, state.tone) };
  });

  const activeRows = rows.filter((row) => row.state.active);
  const lateRows = rows.filter((row) => row.state.tone === 'late');
  const pendingRows = rows.filter((row) => row.state.tone === 'pending');
  const removeRows = rows.filter((row) => row.state.remove);
  const renewingTodayRows = activeRows.filter((row) => daysUntil(row.subscription.current_period_end) === 0);
  const renewing7Rows = activeRows.filter((row) => {
    const days = daysUntil(row.subscription.current_period_end);
    return days !== null && days >= 0 && days <= 7;
  });
  const reviewRows = activeRows.filter((row) => renewalTone(row.subscription) === 'review');
  const filteredRows = currentFilter === 'ativos' ? activeRows : currentFilter === 'vencendo' ? renewing7Rows : currentFilter === 'revisar' ? reviewRows : currentFilter === 'atrasados' ? lateRows : currentFilter === 'pendentes' ? pendingRows : currentFilter === 'remover' ? removeRows : rows;
  const removeEmails = removeRows.map((row) => row.student.email).filter(Boolean).join('\n');
  const lateEmails = lateRows.map((row) => row.student.email).filter(Boolean).join('\n');
  const webhookProblems = logs.filter((log) => eventTone(log) === 'danger').length;

  return (
    <main className="page admin-shell premium-admin-page premium-console">
      <section className="premium-console-hero">
        <div>
          <p className="eyebrow">Area Premium</p>
          <h1>Central de assinantes</h1>
          <p>Controle renovações, webhooks, atrasos e remoções do Grupo VIP em uma visão operacional.</p>
        </div>
        <div className="premium-console-actions">
          <a href="/admin">Voltar</a>
          <a className="primary" href="/admin/premium?status=vencendo">Ver vencendo</a>
        </div>
      </section>

      <nav className="admin-tabs premium-tabs">
        <a href="/admin">Resumo</a><a href="/admin/biblioteca">Biblioteca</a><a href="/admin/premium">Premium</a><a href="/admin/alunos">Alunos</a><a href="/admin/avaliacoes">Avaliacoes</a>
      </nav>

      <section className="premium-health-grid">
        <article className="premium-health-card active"><span>Assinantes ativos</span><strong>{activeRows.length}</strong><p>{reviewRows.length ? `${reviewRows.length} com data antiga para revisar` : 'Todos com acesso liberado'}</p></article>
        <article className="premium-health-card"><span>Renovam hoje</span><strong>{renewingTodayRows.length}</strong><p>{renewing7Rows.length} renovam nos proximos 7 dias</p></article>
        <article className="premium-health-card late"><span>Atrasados</span><strong>{lateRows.length}</strong><p>{lateRows.length ? 'Cobrar renovacao' : 'Nenhum atraso registrado'}</p></article>
        <article className="premium-health-card danger"><span>Remover do grupo</span><strong>{removeRows.length}</strong><p>{webhookProblems} webhooks precisam de atencao</p></article>
      </section>

      <section className="premium-ops-grid">
        <article className="premium-webhook-card">
          <div><p className="eyebrow">Webhook Kiwify</p><h2>Sincronizacao automatica</h2><p>Use esta URL na Kiwify. O historico abaixo confirma vendas, renovacoes, atrasos e cancelamentos.</p></div>
          <code>https://hub.focoemcanto.com/api/kiwify/webhook</code>
        </article>
        <article className="premium-alert-card">
          <p className="eyebrow">Alertas</p>
          <h2>{renewing7Rows.length + lateRows.length + removeRows.length + webhookProblems}</h2>
          <p>itens pedindo atencao agora</p>
          <div><a href="/admin/premium?status=vencendo">Vencendo</a><a href="/admin/premium?status=revisar">Revisar datas</a></div>
        </article>
      </section>

      <section className="premium-filter-bar premium-filter-bar-console">
        <a className={currentFilter === 'todos' ? 'active' : ''} href="/admin/premium?status=todos">Todos</a>
        <a className={currentFilter === 'ativos' ? 'active' : ''} href="/admin/premium?status=ativos">Ativos</a>
        <a className={currentFilter === 'vencendo' ? 'active' : ''} href="/admin/premium?status=vencendo">Vencendo</a>
        <a className={currentFilter === 'revisar' ? 'active late' : ''} href="/admin/premium?status=revisar">Revisar datas</a>
        <a className={currentFilter === 'atrasados' ? 'active' : ''} href="/admin/premium?status=atrasados">Atrasados</a>
        <a className={currentFilter === 'pendentes' ? 'active' : ''} href="/admin/premium?status=pendentes">Pendentes</a>
        <a className={currentFilter === 'remover' ? 'active danger' : ''} href="/admin/premium?status=remover">Remover</a>
      </section>

      <section className="premium-group-tools premium-tools-console">
        <article><p className="eyebrow">Grupo WhatsApp</p><h3>Lista para remover</h3><p>{removeRows.length ? `${removeRows.length} contatos sem acesso ativo.` : 'Nenhum aluno para remover agora.'}</p><textarea readOnly value={removeEmails} placeholder="E-mails para remover aparecem aqui" /></article>
        <article><p className="eyebrow">Cobrança</p><h3>Assinaturas atrasadas</h3><p>{lateRows.length ? `${lateRows.length} alunos para cobrar renovacao.` : 'Nenhuma assinatura atrasada.'}</p><textarea readOnly value={lateEmails} placeholder="E-mails atrasados aparecem aqui" /></article>
      </section>

      <section className="premium-main-grid">
        <article className="premium-panel premium-subscriber-panel">
          <div className="section-heading">
            <div><p className="eyebrow">Gestao de acesso</p><h2>Lista premium</h2></div>
            <span className="pill">{filteredRows.length} contatos</span>
          </div>
          <div className="premium-subscriber-list">
            {filteredRows.map(({ student, subscription, state, renewal, lastEvent, whatsapp }) => (
              <article className={`premium-subscriber-card ${state.tone} renewal-${renewal}`} key={`${student.id}-${subscription?.id || student.email}`}>
                <div className="premium-member-main">
                  <span className={`premium-status ${state.tone}`}>{state.label}</span>
                  <h3>{student.name || 'Sem nome'}</h3>
                  <p>{student.email}</p>
                  <small>{student.whatsapp || 'WhatsApp nao informado'}</small>
                </div>
                <div className="premium-renewal-box">
                  <span>Renovacao</span>
                  <strong>{dateLabel(subscription?.current_period_end)}</strong>
                  <em>{renewalLabel(subscription?.current_period_end)}</em>
                </div>
                <div className="premium-plan-box">
                  <span>Plano</span>
                  <strong>{subscription?.product_name || 'Produto nao informado'}</strong>
                  <small>{subscription?.provider || 'kiwify'} · inicio {dateLabel(subscription?.current_period_start)}</small>
                </div>
                <div className="premium-event-box">
                  <span>Ultimo webhook</span>
                  <strong className={`event-${eventTone(lastEvent)}`}>{eventLabel(lastEvent)}</strong>
                  <small>{lastEvent?.created_at ? dateLabel(lastEvent.created_at) : 'Sem evento vinculado ao email'}</small>
                </div>
                <div className="premium-actions premium-actions-console">
                  <span className={state.remove ? 'remove-tag' : state.tone === 'late' ? 'late-tag' : renewal === 'review' ? 'late-tag' : 'keep-tag'}>{renewal === 'review' && state.active ? 'revisar data' : state.action}</span>
                  {whatsapp ? <a className="button secondary" href={whatsapp} target="_blank">WhatsApp</a> : null}
                </div>
              </article>
            ))}
            {!filteredRows.length ? <p className="muted">Nenhuma assinatura neste filtro.</p> : null}
          </div>
        </article>

        <aside className="premium-panel premium-events-panel">
          <div className="section-heading compact"><div><p className="eyebrow">Kiwify</p><h2>Movimentacoes</h2></div><span className="pill">{logs.length}</span></div>
          <div className="premium-event-timeline">
            {logs.length ? logs.map((log: KiwifyLog) => (
              <article className={`premium-timeline-item ${eventTone(log)}`} key={log.id}>
                <span />
                <div><strong>{eventLabel(log)}</strong><p>{log.customer_email || 'sem email'}</p><small>{log.error_message || dateLabel(log.created_at)}</small></div>
              </article>
            )) : <p className="muted">Nenhum webhook registrado ainda.</p>}
          </div>
        </aside>
      </section>
    </main>
  );
}
