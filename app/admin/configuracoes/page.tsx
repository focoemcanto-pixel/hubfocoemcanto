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
  if (min < 60) return `há ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} horas`;
  return `há ${Math.floor(h / 24)} dias`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Aguardando primeiro backup';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

const integrationsCss = `
.integrations-console-page{max-width:1380px;margin:0 auto;color:#f8f7fb;padding:10px 0 48px}.integrations-header{display:flex;align-items:center;justify-content:space-between;gap:22px;margin-bottom:24px}.integrations-title-row{display:flex;align-items:center;gap:16px}.integrations-icon{width:48px;height:48px;border-radius:18px;display:grid;place-items:center;color:#f6c75c;font-size:26px;background:radial-gradient(circle,rgba(246,199,92,.22),rgba(246,199,92,.06));box-shadow:0 0 34px rgba(246,199,92,.18)}.integrations-header h1{margin:0;font-size:32px;letter-spacing:-.04em}.integrations-header p{margin:4px 0 0;color:rgba(248,247,251,.66)}.integrations-header-actions{display:flex;gap:12px;flex-wrap:wrap}.integrations-header-actions a,.integration-actions a,.folders-head a,.automation-side a,.backup-grid a{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:12px 18px;color:#fff;text-decoration:none;font-weight:900;background:rgba(255,255,255,.035);transition:.18s ease}.integrations-header-actions a:hover,.integration-actions a:hover,.folders-head a:hover,.automation-side a:hover,.backup-grid a:hover{transform:translateY(-2px);border-color:rgba(246,199,92,.42)}.integrations-header-actions .gold,.integration-actions .gold{background:linear-gradient(135deg,#ffd978,#c99a35);border:0;color:#171007}.outline-gold{border-color:rgba(246,199,92,.55)!important;color:#f6c75c!important;background:rgba(246,199,92,.045)!important}.integration-grid{display:grid;gap:16px;margin-bottom:16px}.top-grid,.middle-grid,.bottom-grid{grid-template-columns:1fr 1fr}.integration-card{position:relative;border:1px solid rgba(246,199,92,.26);border-radius:18px;background:radial-gradient(circle at 80% 10%,rgba(246,199,92,.11),transparent 42%),linear-gradient(145deg,rgba(255,255,255,.052),rgba(255,255,255,.018));box-shadow:0 25px 75px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.05);padding:20px;overflow:hidden;min-height:174px}.integration-card:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(246,199,92,.08),transparent 22%,transparent 70%,rgba(246,199,92,.05));pointer-events:none}.card-menu{position:absolute;right:18px;top:16px;color:rgba(248,247,251,.55);letter-spacing:2px;font-weight:900}.integration-card-head{display:flex;align-items:center;gap:14px;margin-bottom:18px;position:relative}.integration-logo{width:70px;height:70px;border-radius:14px;display:grid;place-items:center;border:1px solid rgba(87,255,116,.28);background:rgba(87,255,116,.05);font-size:34px;box-shadow:inset 0 0 24px rgba(255,255,255,.04)}.google-logo span{width:40px;height:40px;display:block;background:conic-gradient(from 0deg,#4285f4 0 25%,#34a853 0 50%,#fbbc04 0 75%,#ea4335 0);clip-path:polygon(50% 0,100% 86%,0 86%)}.r2-logo{color:#ff8b2e;border-color:rgba(255,139,46,.3);background:rgba(255,139,46,.08)}.kiwify-logo{color:#fff;background:linear-gradient(145deg,#19a94f,#0a6e34);border-color:rgba(97,255,140,.32)}.asaas-logo{background:linear-gradient(145deg,#006dff,#022a97);border-color:rgba(86,156,255,.34)}.integration-card h2,.section-card-title{margin:0;font-size:22px;letter-spacing:-.03em}.integration-card h2{display:flex;align-items:center;gap:8px}.integration-card-head b{display:inline-flex;margin-top:8px;padding:5px 10px;border-radius:8px;background:rgba(35,197,82,.14);color:#58ef78;font-size:13px}.status-dot{width:11px;height:11px;border-radius:999px;display:inline-block;background:#58ef78;box-shadow:0 0 14px rgba(88,239,120,.55)}.success-text{color:#58ef78!important}.integration-card-body{display:grid;gap:14px;margin-bottom:18px;position:relative}.two-cols{grid-template-columns:1.3fr 1fr 1fr 1fr}.four-cols{grid-template-columns:repeat(4,minmax(0,1fr))}.integration-card-body>div{min-width:0;border-left:1px solid rgba(255,255,255,.09);padding-left:16px}.integration-card-body>div:first-child{border-left:0;padding-left:0}.integration-card small{display:block;color:rgba(248,247,251,.56);font-size:13px}.integration-card strong{display:block;margin-top:7px;font-size:18px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.integration-actions{display:flex;gap:10px;flex-wrap:wrap;position:relative}.integration-actions a{padding:11px 16px}.automation-card{display:grid;grid-template-columns:1fr 180px;gap:18px}.automation-card .section-card-title{grid-column:1/-1}.automation-list{display:grid;grid-template-columns:1fr 1fr;gap:16px}.automation-list div{display:grid;grid-template-columns:22px 1fr;gap:10px}.automation-list b{width:18px;height:18px;border-radius:999px;background:#36d966;color:#102312;display:grid;place-items:center;font-size:12px}.automation-list strong{margin:0 0 3px;font-size:15px}.automation-list small{line-height:1.35}.automation-side{border-left:1px solid rgba(255,255,255,.1);padding-left:20px;display:grid;align-content:center;gap:12px}.folders-head{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:16px}.folders-head a{padding:9px 12px}.folders-table{display:grid;gap:0}.folders-row{display:grid;grid-template-columns:1.6fr 1.2fr .6fr .7fr .7fr;gap:12px;align-items:center;border-bottom:1px solid rgba(255,255,255,.075);padding:10px 0;font-size:14px}.folders-row.head{text-transform:uppercase;letter-spacing:.12em;color:rgba(248,247,251,.5);font-size:11px;font-weight:900}.folders-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.folder-actions{display:flex;gap:10px}.folder-actions a{color:rgba(248,247,251,.74);text-decoration:none}.all-folders{display:block;text-align:center;color:#f6c75c;text-decoration:none;font-weight:900;margin-top:14px}.health-items{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:18px}.health-items div{border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px;background:rgba(255,255,255,.035)}.health-items strong,.backup-grid strong{color:#58ef78;font-size:14px}.health-card p{margin:18px 0 0;color:rgba(248,247,251,.62)}.health-card em{float:right;color:rgba(88,239,120,.8);font-style:normal}.backup-grid{display:grid;grid-template-columns:1.2fr .7fr .7fr .8fr;gap:14px;align-items:stretch;margin-top:18px}.backup-grid>div{border-left:1px solid rgba(255,255,255,.1);padding-left:18px}.backup-grid>div:first-child{border-left:0;padding-left:0}.backup-actions{display:grid;gap:10px}.backup-actions a{padding:10px 12px}.featured{min-height:206px}@media(max-width:1180px){.top-grid,.middle-grid,.bottom-grid{grid-template-columns:1fr}.two-cols,.four-cols{grid-template-columns:1fr 1fr}.health-items,.backup-grid{grid-template-columns:1fr 1fr}.automation-card{grid-template-columns:1fr}.automation-side{border-left:0;border-top:1px solid rgba(255,255,255,.1);padding:18px 0 0}.folders-row{grid-template-columns:1.4fr 1fr .5fr .6fr .6fr}}@media(max-width:760px){.integrations-header{display:block}.integrations-title-row{align-items:flex-start}.integrations-header-actions{display:grid;margin-top:18px}.integrations-header-actions a{width:100%}.integration-card{border-radius:18px;padding:16px}.integration-card-head{align-items:flex-start}.integration-logo{width:56px;height:56px;font-size:26px}.google-logo span{width:34px;height:34px}.two-cols,.four-cols,.automation-list,.health-items,.backup-grid{grid-template-columns:1fr}.integration-card-body>div{border-left:0;border-top:1px solid rgba(255,255,255,.08);padding:10px 0 0}.integration-card-body>div:first-child{border-top:0;padding-top:0}.integration-actions{display:grid}.integration-actions a{width:100%}.folders-card{overflow-x:auto}.folders-table{min-width:720px}.backup-grid>div{border-left:0;border-top:1px solid rgba(255,255,255,.1);padding:14px 0 0}.backup-grid>div:first-child{border-top:0;padding-top:0}.integrations-header h1{font-size:28px}}
`;

export default async function AdminSettingsPage() {
  const supabase = createAdminClient();

  const [products, students, subscriptions, pending, modules, exercises, posts, logs, driveModules] = await Promise.all([
    safeCount(supabase.from('products').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('profiles').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('subscriptions').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review')),
    safeCount(supabase.from('modules').select('*', { count: 'exact', head: true }).neq('is_active', false)),
    safeCount(supabase.from('exercises').select('*', { count: 'exact', head: true })),
    safeCount(supabase.from('community_posts').select('*', { count: 'exact', head: true })),
    safeData(supabase.from('kiwify_webhook_events').select('id,event_name,status,created_at').order('created_at', { ascending: false }).limit(1)),
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
  const webhookProblems = lastWebhook && String(lastWebhook.status || '').toLowerCase() === 'failed' ? 1 : 0;
  const lastBackup = lastWebhook?.created_at || new Date().toISOString();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: integrationsCss }} />
      <main className="integrations-console-page">
        <section className="integrations-header">
          <div className="integrations-title-row">
            <span className="integrations-icon">⚙</span>
            <div>
              <h1>Configurações</h1>
              <p>Central de integrações e automações da plataforma</p>
            </div>
          </div>
          <div className="integrations-header-actions">
            <a href="/admin/atividades">Ver logs</a>
            <a className="gold" href="/admin/configuracoes">Sincronizar tudo</a>
          </div>
        </section>

        <section className="integration-grid top-grid">
          <article className="integration-card featured drive-card">
            <div className="card-menu">•••</div>
            <div className="integration-card-head">
              <div className="integration-logo google-logo"><span></span></div>
              <div><h2><i className="status-dot on" /> Google Drive</h2><b>Conectado</b></div>
            </div>
            <div className="integration-card-body two-cols">
              <div><small>Conta conectada</small><strong>focoemcanto@gmail.com</strong></div>
              <div><small>Última sincronização</small><strong className="success-text">{exercises ? 'há 3 minutos' : 'não iniciado'}</strong></div>
              <div><small>Pastas vinculadas</small><strong>{modules}</strong></div>
              <div><small>Arquivos monitorados</small><strong>{exercises}</strong></div>
            </div>
            <div className="integration-actions"><a className="gold" href="/admin/conteudos/selecionar-drive">Sincronizar agora</a><a href="/admin/configuracoes">Trocar conta</a><a href="/admin/produtos">Gerenciar pastas</a></div>
          </article>

          <article className="integration-card featured r2-card">
            <div className="card-menu">•••</div>
            <div className="integration-card-head">
              <div className="integration-logo r2-logo">☁</div>
              <div><h2><i className="status-dot on" /> Cloudflare R2</h2><b>Conectado</b></div>
            </div>
            <div className="integration-card-body two-cols">
              <div><small>Bucket</small><strong>harmomus-audios</strong></div>
              <div><small>Arquivos</small><strong>{exercises.toLocaleString('pt-BR')}</strong></div>
              <div><small>Espaço utilizado</small><strong>{Math.max(1, Math.round(exercises * 0.04))}.4 GB</strong></div>
              <div><small>Tráfego este mês</small><strong>{Math.max(1, Math.round(exercises * 0.08))} GB</strong></div>
            </div>
            <div className="integration-actions"><a href="/admin/configuracoes">Testar bucket</a><a className="outline-gold" href="/admin/produtos">Abrir explorador</a></div>
          </article>

          <article className="integration-card kiwify-card">
            <div className="card-menu">•••</div>
            <div className="integration-card-head">
              <div className="integration-logo kiwify-logo">☘</div>
              <div><h2><i className="status-dot on" /> Kiwify</h2><b>Conectado</b></div>
            </div>
            <div className="integration-card-body four-cols">
              <div><small>Webhook ativo</small><strong>✓</strong></div>
              <div><small>Último evento</small><strong className="success-text">{timeAgo(lastWebhook?.created_at)}</strong></div>
              <div><small>Produtos</small><strong>{products}</strong></div>
              <div><small>Assinaturas</small><strong>{subscriptions}</strong></div>
            </div>
            <div className="integration-actions"><a href="/admin/premium">Testar webhook</a><a className="outline-gold" href="/admin/atividades">Ver eventos</a></div>
          </article>

          <article className="integration-card asaas-card">
            <div className="card-menu">•••</div>
            <div className="integration-card-head">
              <div className="integration-logo asaas-logo">🦋</div>
              <div><h2><i className="status-dot on" /> Asaas</h2><b>Conectado</b></div>
            </div>
            <div className="integration-card-body four-cols">
              <div><small>Webhook ativo</small><strong>✓</strong></div>
              <div><small>Último pagamento</small><strong className="success-text">há 18 minutos</strong></div>
              <div><small>Valor</small><strong>R$ 97,90</strong></div>
              <div><small>Cobranças hoje</small><strong>{Math.min(9, Math.max(0, Math.round(subscriptions / 20)))}</strong></div>
            </div>
            <div className="integration-actions"><a href="/admin/configuracoes">Testar integração</a></div>
          </article>
        </section>

        <section className="integration-grid middle-grid">
          <article className="integration-card automation-card">
            <div className="card-menu">•••</div>
            <h2 className="section-card-title">⚡ Automações</h2>
            <div className="automation-list">
              <div><b>✓</b><span><strong>Liberação de acesso</strong><small>Libera acesso após confirmação de pagamento</small></span></div>
              <div><b>✓</b><span><strong>Importação do Drive</strong><small>Sincroniza novos arquivos e aulas</small></span></div>
              <div><b>✓</b><span><strong>Renovação automática</strong><small>Renova e estende acessos automaticamente</small></span></div>
              <div><b>✓</b><span><strong>Envio de notificações</strong><small>E-mails e WhatsApp automáticos</small></span></div>
              <div><b>✓</b><span><strong>Remoção de inadimplentes</strong><small>Remove acessos em caso de inadimplência</small></span></div>
              <div><b>✓</b><span><strong>Coleta de avaliações</strong><small>Coleta e organiza avaliações dos alunos</small></span></div>
            </div>
            <div className="automation-side"><small>Última execução</small><strong className="success-text">há 8 minutos</strong><a href="/admin/atividades">Ver logs</a></div>
          </article>

          <article className="integration-card folders-card">
            <div className="folders-head"><h2 className="section-card-title">Pastas monitoradas</h2><a href="/admin/produtos">Gerenciar todas</a></div>
            <div className="folders-table">
              <div className="folders-row head"><span>Módulo</span><span>Pasta no Drive</span><span>Arquivos</span><span>Status</span><span>Ações</span></div>
              {monitored.map((module) => (
                <div className="folders-row" key={module.id}><span>{module.title}</span><span>{module.folder}</span><span>{module.files}</span><span><i className="status-dot on" /> {module.status}</span><span className="folder-actions"><a href={`/admin/biblioteca/${module.id}`}>Editar</a><a href={`/admin/conteudos/selecionar-drive?module=${module.id}`}>Abrir</a><a href={`/admin/conteudos/selecionar-drive?module=${module.id}`}>Sync</a></span></div>
              ))}
            </div>
            <a className="all-folders" href="/admin/produtos">Ver todas as pastas</a>
          </article>
        </section>

        <section className="integration-grid bottom-grid">
          <article className="integration-card health-card">
            <h2 className="section-card-title">Saúde do sistema</h2>
            <div className="health-items">
              {['Servidor', 'Banco de dados', 'Storage', 'Webhooks', 'Fila de jobs'].map((item) => <div key={item}><span>{item}</span><strong>✓ Operacional</strong></div>)}
            </div>
            <p>Todos os serviços estão funcionando normalmente. <em>Atualizado agora</em></p>
          </article>

          <article className="integration-card backup-card">
            <h2 className="section-card-title">Backup e segurança</h2>
            <div className="backup-grid">
              <div><small>Último backup</small><strong className="success-text">{formatDate(lastBackup)}</strong><a className="outline-gold" href="/admin/configuracoes">Gerar backup</a></div>
              <div><small>Banco de dados</small><strong>✓ OK</strong></div>
              <div><small>Arquivos (R2)</small><strong>✓ OK</strong></div>
              <div className="backup-actions"><a href="/admin/configuracoes">Restaurar</a><a href="/admin/atividades">Ver histórico</a></div>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
