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

function tone(status?: string | null, mapped?: string | null) {
  const value = String(status || mapped || '').toLowerCase();
  if (value.includes('processed') || value.includes('active')) return 'ok';
  if (value.includes('failed') || value.includes('unauthorized')) return 'bad';
  if (value.includes('pending') || value.includes('late')) return 'warn';
  return 'neutral';
}

const css = `
.kiwify-logs-page{max-width:1280px;margin:0 auto;color:#f8f7fb}.kiwify-logs-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;border:1px solid rgba(245,199,107,.22);border-radius:26px;padding:34px;background:radial-gradient(circle at 80% 0,rgba(245,199,107,.16),transparent 42%),linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.02));box-shadow:0 30px 90px rgba(0,0,0,.32);margin-bottom:18px}.kiwify-logs-hero h1{font-size:clamp(42px,6vw,76px);line-height:.95;margin:8px 0;letter-spacing:-.055em}.kiwify-eyebrow{display:block;text-transform:uppercase;letter-spacing:.24em;color:#f5c76b;font-weight:950;font-size:12px}.kiwify-muted{color:rgba(248,247,251,.62)}.kiwify-actions{display:flex;gap:10px;flex-wrap:wrap}.kiwify-btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:12px 18px;color:#fff;text-decoration:none;font-weight:900;background:rgba(255,255,255,.04)}.kiwify-btn.gold{background:linear-gradient(135deg,#ffd978,#c99a35);border:0;color:#171007}.kiwify-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.kiwify-kpis article,.kiwify-panel{border:1px solid rgba(245,199,107,.18);border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.052),rgba(255,255,255,.018));padding:18px}.kiwify-kpis span{display:block;text-transform:uppercase;letter-spacing:.16em;color:#f5c76b;font-size:11px;font-weight:950}.kiwify-kpis strong{display:block;font-size:34px;margin-top:8px}.kiwify-panel h2{font-size:28px;margin:0 0 14px}.kiwify-log-list{display:grid;gap:12px}.kiwify-log-row{display:grid;grid-template-columns:130px 1.1fr 1fr 1fr auto;gap:14px;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:14px;background:rgba(255,255,255,.035)}.kiwify-log-row strong{display:block}.kiwify-log-row small{display:block;color:rgba(248,247,251,.55);margin-top:4px}.kiwify-status{display:inline-flex;border-radius:999px;padding:7px 10px;font-weight:950;font-size:12px}.kiwify-status.ok{background:rgba(47,216,100,.13);color:#65f085}.kiwify-status.bad{background:rgba(255,86,86,.13);color:#ff8d8d}.kiwify-status.warn{background:rgba(245,199,107,.15);color:#ffd978}.kiwify-status.neutral{background:rgba(255,255,255,.08);color:#ddd}.payload-box{white-space:pre-wrap;word-break:break-word;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#090910;padding:12px;color:#cfcfea;max-height:260px;overflow:auto;margin-top:10px}details summary{cursor:pointer;color:#f5c76b;font-weight:900}@media(max-width:900px){.kiwify-logs-hero{display:block}.kiwify-actions{margin-top:16px}.kiwify-kpis{grid-template-columns:1fr 1fr}.kiwify-log-row{grid-template-columns:1fr}.kiwify-btn{width:100%}}@media(max-width:560px){.kiwify-kpis{grid-template-columns:1fr}.kiwify-logs-hero{padding:24px}.kiwify-logs-hero h1{font-size:40px}}
`;

export default async function KiwifyLogsPage() {
  const supabase = createAdminClient();
  const logs = await safeData(supabase.from('kiwify_webhook_events').select('id,event_name,customer_email,product_name,provider_subscription_id,mapped_status,status,error_message,raw_payload,raw_body,created_at').order('created_at', { ascending: false }).limit(150));
  const processed = logs.filter((log: Row) => String(log.status).toLowerCase() === 'processed').length;
  const failed = logs.filter((log: Row) => ['failed', 'unauthorized'].includes(String(log.status).toLowerCase())).length;
  const active = logs.filter((log: Row) => String(log.mapped_status).toLowerCase() === 'active').length;
  const last = logs[0] as Row | undefined;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <main className="kiwify-logs-page">
        <section className="kiwify-logs-hero">
          <div><span className="kiwify-eyebrow">Kiwify Webhook</span><h1>Logs de eventos</h1><p className="kiwify-muted">Acompanhe em tempo real compras, renovações, cancelamentos, falhas e atualizações de acesso.</p></div>
          <div className="kiwify-actions"><a className="kiwify-btn" href="/admin/configuracoes">Voltar</a><a className="kiwify-btn gold" href="/api/kiwify/webhook" target="_blank" rel="noreferrer">Testar endpoint</a></div>
        </section>

        <section className="kiwify-kpis">
          <article><span>Total recebido</span><strong>{logs.length}</strong><small className="kiwify-muted">últimos eventos</small></article>
          <article><span>Processados</span><strong>{processed}</strong><small className="kiwify-muted">atualizaram o Hub</small></article>
          <article><span>Falhas</span><strong>{failed}</strong><small className="kiwify-muted">precisam atenção</small></article>
          <article><span>Último evento</span><strong>{timeAgo(last?.created_at)}</strong><small className="kiwify-muted">{last?.customer_email || 'sem evento'}</small></article>
        </section>

        <section className="kiwify-panel">
          <h2>Eventos recebidos</h2>
          <div className="kiwify-log-list">
            {logs.map((log: Row) => (
              <article className="kiwify-log-row" key={log.id}>
                <span className={`kiwify-status ${tone(log.status, log.mapped_status)}`}>{log.status || 'recebido'}</span>
                <div><strong>{log.event_name || 'Evento sem nome'}</strong><small>{timeAgo(log.created_at)}</small></div>
                <div><strong>{log.customer_email || 'sem e-mail'}</strong><small>{log.product_name || 'produto não identificado'}</small></div>
                <div><strong>{log.mapped_status || 'sem status mapeado'}</strong><small>{log.provider_subscription_id || 'sem id da assinatura'}</small></div>
                <details><summary>Payload</summary><pre className="payload-box">{JSON.stringify(log.raw_payload || log.raw_body || {}, null, 2)}</pre>{log.error_message ? <pre className="payload-box">{log.error_message}</pre> : null}</details>
              </article>
            ))}
            {!logs.length ? <p className="kiwify-muted">Nenhum webhook recebido ainda.</p> : null}
          </div>
        </section>
      </main>
    </>
  );
}
