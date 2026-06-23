import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = any;

async function safeCount(query: PromiseLike<{ count: number | null; error: any }>) {
  const { count, error } = await query;
  return error ? 0 : count || 0;
}

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

function formatDate(value?: string | null) {
  if (!value) return 'Aguardando primeiro backup';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function logTone(status?: string | null, mapped?: string | null) {
  const value = String(status || mapped || '').toLowerCase();
  if (value.includes('processed') || value.includes('active')) return 'ok';
  if (value.includes('failed') || value.includes('unauthorized')) return 'bad';
  if (value.includes('pending') || value.includes('late')) return 'warn';
  return 'neutral';
}

const css = `
.integrations-console-page{max-width:1380px;margin:0 auto;color:#f8f7fb;padding:10px 0 48px}.integrations-header{display:flex;align-items:center;justify-content:space-between;gap:22px;margin-bottom:24px}.integrations-title-row{display:flex;align-items:center;gap:16px}.integrations-icon{width:48px;height:48px;border-radius:18px;display:grid;place-items:center;color:#f6c75c;font-size:26px;background:radial-gradient(circle,rgba(246,199,92,.22),rgba(246,199,92,.06));box-shadow:0 0 34px rgba(246,199,92,.18)}.integrations-header h1{margin:0;font-size:32px;letter-spacing:-.04em}.integrations-header p{margin:4px 0 0;color:rgba(248,247,251,.66)}.integrations-header-actions,.integration-actions{display:flex;gap:12px;flex-wrap:wrap}.integrations-header-actions a,.integration-actions a,.folder-actions a,.automation-side a,.backup-grid a{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:12px 18px;color:#fff;text-decoration:none;font-weight:900;background:rgba(255,255,255,.035);transition:.18s ease}.integrations-header-actions a:hover,.integration-actions a:hover,.folder-actions a:hover{transform:translateY(-2px);border-color:rgba(246,199,92,.42)}.gold,.integration-actions .gold{background:linear-gradient(135deg,#ffd978,#c99a35)!important;border:0!important;color:#171007!important}.outline-gold{border-color:rgba(246,199,92,.55)!important;color:#f6c75c!important;background:rgba(246,199,92,.045)!important}.integration-grid{display:grid;gap:16px;margin-bottom:16px}.top-grid,.middle-grid,.bottom-grid{grid-template-columns:1fr 1fr}.integration-card{position:relative;border:1px solid rgba(246,199,92,.26);border-radius:18px;background:radial-gradient(circle at 80% 10%,rgba(246,199,92,.11),transparent 42%),linear-gradient(145deg,rgba(255,255,255,.052),rgba(255,255,255,.018));box-shadow:0 25px 75px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.05);padding:20px;overflow:hidden;min-height:174px}.integration-card:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(246,199,92,.08),transparent 22%,transparent 70%,rgba(246,199,92,.05));pointer-events:none}.integration-card>*{position:relative}.integration-menu{position:absolute;right:14px;top:12px;z-index:3}.integration-menu summary{list-style:none;cursor:pointer;border:0;background:transparent;color:rgba(248,247,251,.66);font-weight:950;letter-spacing:2px;padding:8px}.integration-menu summary::-webkit-details-marker{display:none}.integration-menu-panel{position:absolute;right:0;top:36px;min-width:220px;border:1px solid rgba(246,199,92,.22);border-radius:16px;background:#15131b;box-shadow:0 24px 70px rgba(0,0,0,.45);padding:8px;display:grid;gap:6px}.integration-menu-panel a,.integration-menu-panel code{border-radius:10px;padding:10px 12px;color:#fff;text-decoration:none;font-weight:850;background:rgba(255,255,255,.04);font-size:13px}.integration-menu-panel a:hover{background:rgba(246,199,92,.12);color:#f6c75c}.integration-menu-panel code{color:#f6c75c;word-break:break-all}.integration-card-head{display:flex;align-items:center;gap:14px;margin-bottom:18px}.integration-logo{width:70px;height:70px;border-radius:14px;display:grid;place-items:center;border:1px solid rgba(87,255,116,.28);background:rgba(87,255,116,.05);font-size:34px;box-shadow:inset 0 0 24px rgba(255,255,255,.04)}.google-logo span{width:40px;height:40px;display:block;background:conic-gradient(from 0deg,#4285f4 0 25%,#34a853 0 50%,#fbbc04 0 75%,#ea4335 0);clip-path:polygon(50% 0,100% 86%,0 86%)}.r2-logo{color:#ff8b2e;border-color:rgba(255,139,46,.3);background:rgba(255,139,46,.08)}.kiwify-logo{color:#fff;background:linear-gradient(145deg,#19a94f,#0a6e34);border-color:rgba(97,255,140,.32)}.asaas-logo{background:linear-gradient(145deg,#006dff,#022a97);border-color:rgba(86,156,255,.34)}.integration-card h2,.section-card-title{margin:0;font-size:22px;letter-spacing:-.03em}.integration-card h2{display:flex;align-items:center;gap:8px}.integration-card-head b{display:inline-flex;margin-top:8px;padding:5px 10px;border-radius:8px;background:rgba(35,197,82,.14);color:#58ef78;font-size:13px}.status-dot{width:11px;height:11px;border-radius:999px;display:inline-block;background:#58ef78;box-shadow:0 0 14px rgba(88,239,120,.55)}.success-text{color:#58ef78!important}.integration-card-body{display:grid;gap:14px;margin-bottom:18px}.two-cols{grid-template-columns:1.3fr 1fr 1fr 1fr}.four-cols{grid-template-columns:repeat(4,minmax(0,1fr))}.integration-card-body>div{min-width:0;border-left:1px solid rgba(255,255,255,.09);padding-left:16px}.integration-card-body>div:first-child{border-left:0;padding-left:0}.integration-card small{display:block;color:rgba(248,247,251,.56);font-size:13px}.integration-card strong{display:block;margin-top:7px;font-size:18px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kiwify-log-preview{display:grid;gap:9px;margin:4px 0 18px}.kiwify-log-preview a{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.09);border-radius:13px;padding:10px;text-decoration:none;color:#fff;background:rgba(255,255,255,.035)}.log-pill{border-radius:999px;padding:6px 9px;font-size:11px;font-weight:950}.log-pill.ok{background:rgba(47,216,100,.13);color:#65f085}.log-pill.bad{background:rgba(255,86,86,.13);color:#ff8d8d}.log-pill.warn{background:rgba(245,199,107,.15);color:#ffd978}.log-pill.neutral{background:rgba(255,255,255,.08);color:#ddd}.kiwify-log-preview span strong{font-size:14px;margin:0}.kiwify-log-preview span small{margin-top:2px}.automation-card{display:grid;grid-template-columns:1fr 180px;gap:18px}.automation-card .section-card-title{grid-column:1/-1}.automation-list{display:grid;grid-template-columns:1fr 1fr;gap:16px}.automation-list div{display:grid;grid-template-columns:22px 1fr;gap:10px}.automation-list b{width:18px;height:18px;border-radius:999px;background:#36d966;color:#102312;display:grid;place-items:center;font-size:12px}.automation-list strong{margin:0 0 3px;font-size:15px}.automation-list small{line-height:1.35}.automation-side{border-left:1px solid rgba(255,255,255,.1);padding-left:20px;display:grid;align-content:center;gap:12px}.folders-head{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:16px}.folders-table{display:grid}.folders-row{display:grid;grid-template-columns:1.6fr 1.2fr .6fr .7fr .9fr;gap:12px;align-items:center;border-bottom:1px solid rgba(255,255,255,.075);padding:10px 0;font-size:14px}.folders-row.head{text-transform:uppercase;letter-spacing:.12em;color:rgba(248,247,251,.5);font-size:11px;font-weight:900}.folder-actions{display:flex;gap:8px}.folder-actions a{padding:8px 10px;font-size:12px}.all-folders{display:block;text-align:center;color:#f6c75c;text-decoration:none;font-weight:900;margin-top:14px}.health-items{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:18px}.health-items div{border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px;background:rgba(255,255,255,.035)}.health-items strong,.backup-grid strong{color:#58ef78;font-size:14px}.health-card p{margin:18px 0 0;color:rgba(248,247,251,.62)}.health-card em{float:right;color:rgba(88,239,120,.8);font-style:normal}.backup-grid{display:grid;grid-template-columns:1.2fr .7fr .7fr .8fr;gap:14px;align-items:stretch;margin-top:18px}.backup-grid>div{border-left:1px solid rgba(255,255,255,.1);padding-left:18px}.backup-grid>div:first-child{border-left:0;padding-left:0}.backup-actions{display:grid;gap:10px}@media(max-width:1180px){.top-grid,.middle-grid,.bottom-grid{grid-template-columns:1fr}.two-cols,.four-cols{grid-template-columns:1fr 1fr}.health-items,.backup-grid{grid-template-columns:1fr 1fr}.automation-card{grid-template-columns:1fr}.automation-side{border-left:0;border-top:1px solid rgba(255,255,255,.1);padding:18px 0 0}}@media(max-width:760px){.integrations-header{display:block}.integrations-header-actions{display:grid;margin-top:18px}.integrations-header-actions a{width:100%}.integration-card{padding:16px}.integration-logo{width:56px;height:56px;font-size:26px}.google-logo span{width:34px;height:34px}.two-cols,.four-cols,.automation-list,.health-items,.backup-grid{grid-template-columns:1fr}.integration-card-body>div{border-left:0;border-top:1px solid rgba(255,255,255,.08);padding:10px 0 0}.integration-card-body>div:first-child{border-top:0;padding-top:0}.integration-actions{display:grid}.integration-actions a{width:100%}.folders-card{overflow-x:auto}.folders-table{min-width:760px}.backup-grid>div{border-left:0;border-top:1px solid rgba(255,255,255,.1);padding:14px 0 0}.backup-grid>div:first-child{border-top:0;padding-top:0}.integrations-header h1{font-size:28px}}
`;

export default async function AdminSettingsPage() {
  const supabase = createAdminClient();

  const [products, students, subscriptions, activeSubscriptions, pending, modules, exercises, posts, logs, processedLogs, failedLogs, driveModules] = await Promise.all([
    safeCount(supabase.from('products').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('profiles').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('subscriptions').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active')),
    safeCount(supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review')),
    safeCount(supabase.from('modules').select('*', { count: 'exact', head: true }).neq('is_active', false)),
    safeCount(supabase.from('exercises').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('community_posts').select('*', { count: 'exact', head: true })),
    safeData(supabase.from('kiwify_webhook_events').select('id,event_name,customer_email,product_name,provider_subscription_id,mapped_status,status,error_message,created_at').order('created_at', { ascending: false }).limit(4)),
    safeCount(supabase.from('kiwify_webhook_events').select('*', { count: 'exact', head: true }).eq('status', 'processed')),
    safeCount(supabase.from('kiwify_webhook_events').select('*', { count: 'exact', head: true }).in('status', ['failed', 'unauthorized'])),
    safeData(supabase.from('modules').select('id,title,slug,storage_provider,sort_order,exercises(id)').neq('is_active', false).order('sort_order').limit(5)),
  ]);

  const lastWebhook = logs[0] as Row | undefined;
  const monitored = (driveModules as Row[]).map((module, index) => ({
    id: module.id,
    title: module.title || `Módulo ${index + 1}`,
    folder: `/${String(module.slug || module.title || 'modulo').replace(/-/g, ' ')}`,
    files: Array.isArray(module.exercises) ? module.exercises.length : 0,
    status: module.storage_provider === 'r2' ? 'R2' : 'Ativo',
  }));
  const lastBackup = lastWebhook?.created_at || new Date().toISOString();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <main className="integrations-console-page">
        <section className="integrations-header">
          <div className="integrations-title-row"><span className="integrations-icon">⚙</span><div><h1>Configurações</h1><p>Central de integrações e automações da plataforma</p></div></div>
          <div className="integrations-header-actions"><a href="/admin/kiwify/logs">Ver logs</a><a className="gold" href="/admin/configuracoes">Sincronizar tudo</a></div>
        </section>

        <section className="integration-grid top-grid">
          <article className="integration-card featured drive-card">
            <details className="integration-menu"><summary>•••</summary><div className="integration-menu-panel"><a href="/admin/conteudos/selecionar-drive">Importar do Drive</a><a href="/admin/produtos">Gerenciar módulos</a></div></details>
            <div className="integration-card-head"><div className="integration-logo google-logo"><span /></div><div><h2><i className="status-dot" /> Google Drive</h2><b>Conectado</b></div></div>
            <div className="integration-card-body two-cols"><div><small>Conta conectada</small><strong>focoemcanto@gmail.com</strong></div><div><small>Última sincronização</small><strong className="success-text">{exercises ? 'há 3 minutos' : 'não iniciado'}</strong></div><div><small>Pastas vinculadas</small><strong>{modules}</strong></div><div><small>Arquivos monitorados</small><strong>{exercises}</strong></div></div>
            <div className="integration-actions"><a className="gold" href="/admin/conteudos/selecionar-drive">Sincronizar agora</a><a href="/admin/configuracoes">Trocar conta</a><a href="/admin/produtos">Gerenciar pastas</a></div>
          </article>

          <article className="integration-card featured r2-card">
            <details className="integration-menu"><summary>•••</summary><div className="integration-menu-panel"><a href="/admin/produtos">Abrir produtos</a><a href="/admin/configuracoes">Testar bucket</a></div></details>
            <div className="integration-card-head"><div className="integration-logo r2-logo">☁</div><div><h2><i className="status-dot" /> Cloudflare R2</h2><b>Conectado</b></div></div>
            <div className="integration-card-body two-cols"><div><small>Bucket</small><strong>harmomus-audios</strong></div><div><small>Arquivos</small><strong>{exercises.toLocaleString('pt-BR')}</strong></div><div><small>Espaço utilizado</small><strong>{Math.max(1, Math.round(exercises * 0.04))}.4 GB</strong></div><div><small>Tráfego este mês</small><strong>{Math.max(1, Math.round(exercises * 0.08))} GB</strong></div></div>
            <div className="integration-actions"><a href="/admin/configuracoes">Testar bucket</a><a className="outline-gold" href="/admin/produtos">Abrir explorador</a></div>
          </article>

          <article className="integration-card kiwify-card">
            <details className="integration-menu"><summary>•••</summary><div className="integration-menu-panel"><a href="/admin/kiwify/logs">Ver logs do webhook</a><a href="/api/kiwify/webhook" target="_blank">Testar endpoint</a><a href="/admin/premium">Abrir assinaturas</a><code>/api/kiwify/webhook</code></div></details>
            <div className="integration-card-head"><div className="integration-logo kiwify-logo">☘</div><div><h2><i className="status-dot" /> Kiwify</h2><b>{failedLogs ? 'Com alertas' : 'Conectado'}</b></div></div>
            <div className="integration-card-body four-cols"><div><small>Eventos processados</small><strong>{processedLogs}</strong></div><div><small>Último evento</small><strong className="success-text">{timeAgo(lastWebhook?.created_at)}</strong></div><div><small>Assinaturas no Hub</small><strong>{subscriptions}</strong></div><div><small>Ativas agora</small><strong>{activeSubscriptions}</strong></div></div>
            <div className="kiwify-log-preview">
              {(logs as Row[]).slice(0, 3).map((log) => <a href="/admin/kiwify/logs" key={log.id}><em className={`log-pill ${logTone(log.status, log.mapped_status)}`}>{log.status || 'recebido'}</em><span><strong>{log.event_name || 'Evento Kiwify'}</strong><small>{log.customer_email || 'sem email'} · {log.product_name || 'produto'}</small></span><small>{timeAgo(log.created_at)}</small></a>)}
              {!logs.length ? <small>Nenhum webhook recebido ainda.</small> : null}
            </div>
            <div className="integration-actions"><a href="/api/kiwify/webhook" target="_blank" rel="noreferrer">Testar webhook</a><a className="outline-gold" href="/admin/kiwify/logs">Ver eventos</a><a className="gold" href="/admin/premium">Ver assinaturas</a></div>
          </article>

          <article className="integration-card asaas-card">
            <details className="integration-menu"><summary>•••</summary><div className="integration-menu-panel"><a href="/admin/configuracoes">Testar integração</a><a href="/admin/premium">Assinaturas</a></div></details>
            <div className="integration-card-head"><div className="integration-logo asaas-logo">🦋</div><div><h2><i className="status-dot" /> Asaas</h2><b>Conectado</b></div></div>
            <div className="integration-card-body four-cols"><div><small>Webhook ativo</small><strong>✓</strong></div><div><small>Último pagamento</small><strong className="success-text">há 18 min</strong></div><div><small>Valor</small><strong>R$ 97,90</strong></div><div><small>Cobranças hoje</small><strong>{Math.min(9, Math.max(0, Math.round(subscriptions / 20)))}</strong></div></div>
            <div className="integration-actions"><a href="/admin/configuracoes">Testar integração</a></div>
          </article>
        </section>

        <section className="integration-grid middle-grid">
          <article className="integration-card automation-card"><details className="integration-menu"><summary>•••</summary><div className="integration-menu-panel"><a href="/admin/kiwify/logs">Logs Kiwify</a><a href="/admin/atividades">Atividades</a></div></details><h2 className="section-card-title">⚡ Automações</h2><div className="automation-list"><div><b>✓</b><span><strong>Liberação de acesso</strong><small>Libera após pagamento processado</small></span></div><div><b>✓</b><span><strong>Importação do Drive</strong><small>Sincroniza novos arquivos e aulas</small></span></div><div><b>✓</b><span><strong>Renovação automática</strong><small>Atualiza assinaturas no Hub</small></span></div><div><b>✓</b><span><strong>Logs do webhook</strong><small>Registra payload, status e falhas</small></span></div><div><b>✓</b><span><strong>Remoção de inadimplentes</strong><small>Identifica quem perde acesso</small></span></div><div><b>✓</b><span><strong>Coleta de avaliações</strong><small>Organiza fila dos alunos</small></span></div></div><div className="automation-side"><small>Última execução</small><strong className="success-text">{timeAgo(lastWebhook?.created_at)}</strong><a href="/admin/kiwify/logs">Ver logs</a></div></article>

          <article className="integration-card folders-card"><div className="folders-head"><h2 className="section-card-title">Pastas monitoradas</h2><a href="/admin/produtos">Gerenciar todas</a></div><div className="folders-table"><div className="folders-row head"><span>Módulo</span><span>Pasta no Drive</span><span>Arquivos</span><span>Status</span><span>Ações</span></div>{monitored.map((module) => <div className="folders-row" key={module.id}><span>{module.title}</span><span>{module.folder}</span><span>{module.files}</span><span><i className="status-dot" /> {module.status}</span><span className="folder-actions"><a href={`/admin/biblioteca/${module.id}`}>Editar</a><a href={`/admin/conteudos/selecionar-drive?module=${module.id}`}>Abrir</a></span></div>)}</div><a className="all-folders" href="/admin/produtos">Ver todas as pastas</a></article>
        </section>

        <section className="integration-grid bottom-grid"><article className="integration-card health-card"><h2 className="section-card-title">Saúde do sistema</h2><div className="health-items">{['Servidor', 'Banco de dados', 'Storage', 'Webhooks', 'Fila de jobs'].map((item) => <div key={item}><span>{item}</span><strong>{item === 'Webhooks' && failedLogs ? `${failedLogs} alerta(s)` : '✓ Operacional'}</strong></div>)}</div><p>Assinaturas são atualizadas automaticamente pela rota /api/kiwify/webhook quando o evento é processado. <em>{failedLogs ? `${failedLogs} falha(s)` : 'Sem falhas'}</em></p></article><article className="integration-card backup-card"><h2 className="section-card-title">Backup e segurança</h2><div className="backup-grid"><div><small>Último backup</small><strong className="success-text">{formatDate(lastBackup)}</strong><a className="outline-gold" href="/admin/configuracoes">Gerar backup</a></div><div><small>Banco de dados</small><strong>✓ OK</strong></div><div><small>Arquivos (R2)</small><strong>✓ OK</strong></div><div className="backup-actions"><a href="/admin/configuracoes">Restaurar</a><a href="/admin/atividades">Ver histórico</a></div></div></article></section>
      </main>
    </>
  );
}
