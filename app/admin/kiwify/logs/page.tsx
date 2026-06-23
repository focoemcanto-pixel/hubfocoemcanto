import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = any;

async function safeData(query: PromiseLike<{ data: any; error: any }>) {
  const { data, error } = await query;
  return error ? [] : Array.isArray(data) ? data : [];
}

function timeAgo(value?: string | null) {
  if (!value) return 'não registrado';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function eventLabel(event?: string | null) {
  const value = String(event || '').toLowerCase();
  if (value.includes('subscription_renewed') || value.includes('subscription.renewed')) return 'Assinatura renovada';
  if (value.includes('subscription_canceled') || value.includes('subscription.cancel')) return 'Assinatura cancelada';
  if (value.includes('subscription_late') || value.includes('late')) return 'Assinatura em atraso';
  if (value.includes('order_approved') || value.includes('order.approved') || value.includes('paid')) return 'Compra aprovada';
  if (value.includes('billet_created') || value.includes('boleto')) return 'Boleto gerado';
  if (value.includes('pix_created') || value.includes('pix')) return 'Pix gerado';
  if (value.includes('refund')) return 'Reembolso';
  if (value.includes('chargeback')) return 'Contestação';
  return 'Evento recebido';
}

function businessStatus(log: Row) {
  const mapped = String(log.mapped_status || '').toLowerCase();
  const event = String(log.event_name || '').toLowerCase();
  if (mapped === 'active' || event.includes('approved') || event.includes('renewed') || event.includes('paid')) return 'Acesso ativo';
  if (mapped === 'late' || event.includes('late')) return 'Pagamento atrasado';
  if (mapped === 'pending' || event.includes('billet') || event.includes('pix')) return 'Aguardando pagamento';
  if (mapped === 'canceled' || event.includes('cancel')) return 'Acesso cancelado';
  return 'Recebido';
}

function syncState(log: Row) {
  const status = String(log.status || '').toLowerCase();
  if (status === 'processed') return { label: 'Sincronizado', tone: 'ok', description: 'Atualizou aluno/assinatura no Hub.' };
  if (status === 'unauthorized') return { label: 'Recebido pela Kiwify', tone: 'warn', description: 'Compra existe na Kiwify, mas este evento não atualizou o Hub porque o token do webhook não conferiu.' };
  if (status === 'failed') return { label: 'Não sincronizado', tone: 'bad', description: 'O Hub recebeu o evento, mas não conseguiu atualizar aluno/assinatura.' };
  return { label: 'Recebido', tone: 'neutral', description: 'Evento registrado para conferência.' };
}

function statusTone(log: Row) {
  return syncState(log).tone;
}

function productName(log: Row) {
  const value = log.product_name || log.raw_payload?.Product?.product_name || log.raw_payload?.product?.name || log.raw_payload?.product_name;
  return value || 'Produto não identificado';
}

function customerEmail(log: Row) {
  return log.customer_email || log.raw_payload?.Customer?.email || log.raw_payload?.customer?.email || log.raw_payload?.email || 'sem e-mail';
}

function payloadPreview(log: Row) {
  const payload = log.raw_payload || log.raw_body || {};
  return JSON.stringify(payload, null, 2);
}

function humanError(log: Row) {
  const status = String(log.status || '').toLowerCase();
  if (status === 'unauthorized') return 'Token do webhook diferente do configurado no Hub. A venda pode estar correta na Kiwify, mas este evento não sincronizou automaticamente.';
  if (!log.error_message) return '';
  const error = String(log.error_message);
  if (error.includes('customer_email_missing')) return 'A Kiwify não enviou o e-mail do comprador neste evento.';
  if (error.includes('subscription_error')) return 'O Hub não conseguiu salvar a assinatura no banco.';
  if (error.includes('profile_error')) return 'O Hub não conseguiu criar ou atualizar o aluno.';
  return error;
}

const css = `
.kiwify-logs-page{max-width:1280px;margin:0 auto;color:#f8f7fb}.kiwify-logs-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;border:1px solid rgba(245,199,107,.22);border-radius:26px;padding:34px;background:radial-gradient(circle at 80% 0,rgba(245,199,107,.16),transparent 42%),linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.02));box-shadow:0 30px 90px rgba(0,0,0,.32);margin-bottom:18px}.kiwify-logs-hero h1{font-size:clamp(42px,6vw,76px);line-height:.95;margin:8px 0;letter-spacing:-.055em}.kiwify-eyebrow{display:block;text-transform:uppercase;letter-spacing:.24em;color:#f5c76b;font-weight:950;font-size:12px}.kiwify-muted{color:rgba(248,247,251,.62)}.kiwify-actions{display:flex;gap:10px;flex-wrap:wrap}.kiwify-btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:12px 18px;color:#fff;text-decoration:none;font-weight:900;background:rgba(255,255,255,.04)}.kiwify-btn.gold{background:linear-gradient(135deg,#ffd978,#c99a35);border:0;color:#171007}.kiwify-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.kiwify-kpis article,.kiwify-panel{border:1px solid rgba(245,199,107,.18);border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.052),rgba(255,255,255,.018));padding:18px}.kiwify-kpis span{display:block;text-transform:uppercase;letter-spacing:.16em;color:#f5c76b;font-size:11px;font-weight:950}.kiwify-kpis strong{display:block;font-size:34px;margin-top:8px}.kiwify-panel h2{font-size:28px;margin:0 0 14px}.kiwify-panel-note{border:1px solid rgba(245,199,107,.18);border-radius:16px;background:rgba(245,199,107,.06);padding:12px 14px;color:rgba(248,247,251,.76);margin:0 0 16px}.kiwify-log-list{display:grid;gap:12px}.kiwify-log-row{display:grid;grid-template-columns:170px 1.1fr 1fr 1.1fr auto;gap:14px;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:14px;background:rgba(255,255,255,.035)}.kiwify-log-row strong{display:block}.kiwify-log-row small{display:block;color:rgba(248,247,251,.55);margin-top:4px}.kiwify-status{display:inline-flex;border-radius:999px;padding:8px 12px;font-weight:950;font-size:12px;white-space:nowrap}.kiwify-status.ok{background:rgba(47,216,100,.13);color:#65f085}.kiwify-status.bad{background:rgba(255,86,86,.13);color:#ff8d8d}.kiwify-status.warn{background:rgba(245,199,107,.15);color:#ffd978}.kiwify-status.neutral{background:rgba(255,255,255,.08);color:#ddd}.payload-box{white-space:pre-wrap;word-break:break-word;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#090910;padding:12px;color:#cfcfea;max-height:260px;overflow:auto;margin-top:10px}details summary{cursor:pointer;color:#f5c76b;font-weight:900}.kiwify-sync-description{max-width:320px}.kiwify-sync-description strong{font-size:15px}.kiwify-sync-description small{line-height:1.3}.kiwify-error-text{color:#ffd978!important}@media(max-width:900px){.kiwify-logs-hero{display:block}.kiwify-actions{margin-top:16px}.kiwify-kpis{grid-template-columns:1fr 1fr}.kiwify-log-row{grid-template-columns:1fr}.kiwify-btn{width:100%}}@media(max-width:560px){.kiwify-kpis{grid-template-columns:1fr}.kiwify-logs-hero{padding:24px}.kiwify-logs-hero h1{font-size:40px}}
`;

export default async function KiwifyLogsPage() {
  const supabase = createAdminClient();
  const logs = await safeData(supabase.from('kiwify_webhook_events').select('id,event_name,customer_email,product_name,provider_subscription_id,mapped_status,status,error_message,raw_payload,raw_body,created_at').order('created_at', { ascending: false }).limit(150));
  const processed = logs.filter((log: Row) => String(log.status).toLowerCase() === 'processed').length;
  const notSynced = logs.filter((log: Row) => ['failed', 'unauthorized'].includes(String(log.status).toLowerCase())).length;
  const receivedPurchases = logs.filter((log: Row) => ['Acesso ativo', 'Aguardando pagamento'].includes(businessStatus(log))).length;
  const last = logs[0] as Row | undefined;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <main className="kiwify-logs-page">
        <section className="kiwify-logs-hero">
          <div><span className="kiwify-eyebrow">Kiwify</span><h1>Histórico de vendas</h1><p className="kiwify-muted">Veja em linguagem simples o que chegou da Kiwify e se o Hub conseguiu atualizar o acesso do aluno.</p></div>
          <div className="kiwify-actions"><a className="kiwify-btn" href="/admin/configuracoes">Voltar</a><a className="kiwify-btn gold" href="/api/kiwify/webhook" target="_blank" rel="noreferrer">Testar conexão</a></div>
        </section>

        <section className="kiwify-kpis">
          <article><span>Eventos recebidos</span><strong>{logs.length}</strong><small className="kiwify-muted">últimos registros da Kiwify</small></article>
          <article><span>Compras/renovações</span><strong>{receivedPurchases}</strong><small className="kiwify-muted">eventos comerciais recebidos</small></article>
          <article><span>Sincronizados</span><strong>{processed}</strong><small className="kiwify-muted">atualizaram alunos/assinaturas</small></article>
          <article><span>Precisam configurar</span><strong>{notSynced}</strong><small className="kiwify-muted">token ou banco precisam revisão</small></article>
        </section>

        <section className="kiwify-panel">
          <h2>Eventos recebidos</h2>
          <p className="kiwify-panel-note">Importante: uma compra pode estar aprovada corretamente na Kiwify mesmo quando aparece como “precisa configurar” aqui. Isso indica apenas que o Hub não conseguiu sincronizar automaticamente aquele evento.</p>
          <div className="kiwify-log-list">
            {logs.map((log: Row) => {
              const sync = syncState(log);
              const error = humanError(log);
              return (
                <article className="kiwify-log-row" key={log.id}>
                  <span className={`kiwify-status ${statusTone(log)}`}>{sync.label}</span>
                  <div><strong>{eventLabel(log.event_name)}</strong><small>{timeAgo(log.created_at)}</small></div>
                  <div><strong>{customerEmail(log)}</strong><small>{productName(log)}</small></div>
                  <div className="kiwify-sync-description"><strong>{businessStatus(log)}</strong><small>{sync.description}</small>{error ? <small className="kiwify-error-text">{error}</small> : null}</div>
                  <details><summary>Detalhes técnicos</summary><pre className="payload-box">{payloadPreview(log)}</pre>{log.error_message ? <pre className="payload-box">{String(log.error_message)}</pre> : null}</details>
                </article>
              );
            })}
            {!logs.length ? <p className="kiwify-muted">Nenhum webhook recebido ainda.</p> : null}
          </div>
        </section>
      </main>
    </>
  );
}
