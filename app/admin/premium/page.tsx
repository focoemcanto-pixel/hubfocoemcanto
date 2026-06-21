import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Subscription = {
  status?: string | null;
  current_period_end?: string | null;
  product_name?: string | null;
  provider?: string | null;
  updated_at?: string | null;
};

function relatedSub(value: unknown): Subscription | null {
  if (Array.isArray(value)) return (value[0] || null) as Subscription | null;
  return (value || null) as Subscription | null;
}

function isExpired(date?: string | null) {
  if (!date) return false;
  return new Date(date).getTime() < Date.now();
}

function accessStatus(subscription?: Subscription | null) {
  if (!subscription) return { label: 'sem assinatura', tone: 'neutral', active: false, remove: true, action: 'verificar' };
  const status = String(subscription.status || 'pending').toLowerCase();
  const expired = isExpired(subscription.current_period_end);
  if (status === 'active' && !expired) return { label: 'ativo', tone: 'active', active: true, remove: false, action: 'manter no grupo' };
  if (status === 'late') return { label: 'atrasado', tone: 'late', active: false, remove: false, action: 'cobrar renovação' };
  if (status === 'pending') return { label: 'pendente', tone: 'pending', active: false, remove: false, action: 'aguardar pagamento' };
  if (expired) return { label: 'vencido', tone: 'danger', active: false, remove: true, action: 'tirar do grupo' };
  return { label: status || 'inativo', tone: 'danger', active: false, remove: true, action: 'tirar do grupo' };
}

function whatsappLink(phone?: string | null, name?: string | null, state?: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const message = state === 'late'
    ? `Oi ${name || ''}, tudo bem? Vi que sua assinatura do Grupo VIP está atrasada. Quer que eu te envie o link para regularizar?`
    : `Oi ${name || ''}, tudo bem? Estou conferindo seu acesso ao Grupo VIP Foco em Harmonia.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

async function safeQuery<T>(query: PromiseLike<{ data: T | null; error: any }>, fallback: T): Promise<T> {
  const { data, error } = await query;
  if (error) return fallback;
  return data || fallback;
}

export default async function AdminPremiumPage() {
  const supabase = createAdminClient();
  const students = await safeQuery(
    supabase
      .from('profiles')
      .select('id,name,email,whatsapp,role,created_at,subscriptions(status,current_period_end,product_name,provider,updated_at)')
      .order('created_at', { ascending: false })
      .limit(300),
    [] as any[]
  );
  const logs = await safeQuery(
    supabase
      .from('kiwify_webhook_events')
      .select('id,event_name,customer_email,product_name,mapped_status,status,error_message,created_at')
      .order('created_at', { ascending: false })
      .limit(12),
    [] as any[]
  );

  const rows = (students || []).map((student: any) => {
    const subscription = relatedSub(student.subscriptions);
    const state = accessStatus(subscription);
    return { student, subscription, state, whatsapp: whatsappLink(student.whatsapp, student.name, state.tone) };
  });
  const active = rows.filter((row) => row.state.active).length;
  const pending = rows.filter((row) => row.state.tone === 'pending').length;
  const late = rows.filter((row) => row.state.tone === 'late').length;
  const inactive = rows.filter((row) => !row.state.active && !['pending', 'late'].includes(row.state.tone)).length;
  const removeFromGroup = rows.filter((row) => row.state.remove).length;

  return (
    <main className="page admin-shell premium-admin-page">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Área Premium</p>
          <h1>Assinantes Kiwify</h1>
          <p className="muted">Valide assinantes ativos, atrasados, pendentes e quem precisa sair do grupo VIP.</p>
        </div>
        <a className="button secondary" href="/admin">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/biblioteca">Biblioteca</a>
        <a href="/admin/premium">Premium</a>
        <a href="/admin/alunos">Alunos</a>
        <a href="/admin/avaliacoes">Avaliações</a>
      </nav>

      <section className="premium-sync-card">
        <div>
          <p className="eyebrow">Webhook Kiwify</p>
          <h2>Conecte a Kiwify ao Hub</h2>
          <p>Use esta URL no painel da Kiwify. Eventos de teste agora aparecem no histórico abaixo mesmo quando ainda falta SQL.</p>
        </div>
        <code>https://hub.focoemcanto.com/api/kiwify/webhook</code>
      </section>

      <section className="admin-grid premium-kpis">
        <article className="admin-stat"><span>Ativos</span><strong>{active}</strong></article>
        <article className="admin-stat late"><span>Atrasados</span><strong>{late}</strong></article>
        <article className="admin-stat"><span>Pendentes</span><strong>{pending}</strong></article>
        <article className="admin-stat danger"><span>Remover do grupo</span><strong>{removeFromGroup}</strong></article>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Gestão de acesso</p>
            <h2>Lista premium</h2>
          </div>
          <span className="pill">{rows.length} contatos</span>
        </div>
        <div className="premium-table">
          {rows.map(({ student, subscription, state, whatsapp }) => (
            <article className={`premium-row ${state.tone}`} key={student.id}>
              <div>
                <span className={`premium-status ${state.tone}`}>{state.label}</span>
                <h3>{student.name || 'Sem nome'}</h3>
                <p>{student.email}</p>
                <small>{student.whatsapp || 'WhatsApp não informado'}</small>
              </div>
              <div>
                <strong>{subscription?.product_name || 'Produto não informado'}</strong>
                <span>{subscription?.provider || 'kiwify'}</span>
                <small>Vence em: {subscription?.current_period_end || 'sem vencimento'}</small>
              </div>
              <div className="premium-actions">
                <span className={state.remove ? 'remove-tag' : state.tone === 'late' ? 'late-tag' : 'keep-tag'}>{state.action}</span>
                {whatsapp ? <a className="button secondary" href={whatsapp} target="_blank">WhatsApp</a> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Diagnóstico</p>
            <h2>Últimos eventos recebidos da Kiwify</h2>
          </div>
          <span className="pill">{logs.length} eventos</span>
        </div>
        <div className="premium-log-list">
          {logs.length ? logs.map((log: any) => (
            <article className={`premium-log-row ${log.status}`} key={log.id}>
              <div><strong>{log.event_name || 'evento'}</strong><p>{log.customer_email || 'sem email'} · {log.product_name || 'sem produto'}</p></div>
              <span>{log.mapped_status || log.status}</span>
              <small>{log.error_message || log.created_at}</small>
            </article>
          )) : <p className="muted">Nenhum evento registrado ainda. Depois de executar o SQL abaixo, envie o teste novamente na Kiwify.</p>}
        </div>
      </section>
    </main>
  );
}
