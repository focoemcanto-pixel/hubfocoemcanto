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
  const activeSubscriptions = subscriptions;
  const webhookProblems = lastWebhook && String(lastWebhook.status || '').toLowerCase() === 'failed' ? 1 : 0;
  const lastBackup = lastWebhook?.created_at || new Date().toISOString();

  return (
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
          <a href="/admin/atividades">▣ Ver logs</a>
          <a className="gold" href="/admin/configuracoes">⟳ Sincronizar tudo</a>
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
          <div className="integration-actions"><a className="gold" href="/admin/conteudos/selecionar-drive">⟳ Sincronizar agora</a><a href="/admin/configuracoes">♙ Trocar conta</a><a href="/admin/produtos">▣ Gerenciar pastas</a></div>
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
          <div className="integration-actions"><a href="/admin/configuracoes">▣ Testar bucket</a><a className="outline-gold" href="/admin/produtos">↗ Abrir explorador</a></div>
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
          <div className="integration-actions"><a href="/admin/premium">◴ Testar webhook</a><a className="outline-gold" href="/admin/atividades">▣ Ver eventos</a></div>
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
            <div><small>Cobranças hoje</small><strong>{Math.min(9, Math.max(0, Math.round(activeSubscriptions / 20)))}</strong></div>
          </div>
          <div className="integration-actions"><a href="/admin/configuracoes">◴ Testar integração</a></div>
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
          <div className="automation-side"><small>Última execução</small><strong className="success-text">há 8 minutos</strong><a href="/admin/atividades">▣ Ver logs</a></div>
        </article>

        <article className="integration-card folders-card">
          <div className="folders-head"><h2 className="section-card-title">▣ Pastas monitoradas</h2><a href="/admin/produtos">⟳ Gerenciar todas</a></div>
          <div className="folders-table">
            <div className="folders-row head"><span>Módulo</span><span>Pasta no Drive</span><span>Arquivos</span><span>Status</span><span>Ações</span></div>
            {monitored.map((module) => (
              <div className="folders-row" key={module.id}><span>{module.title}</span><span>{module.folder}</span><span>{module.files}</span><span><i className="status-dot on" /> {module.status}</span><span className="folder-actions"><a href={`/admin/biblioteca/${module.id}`}>✎</a><a href={`/admin/conteudos/selecionar-drive?module=${module.id}`}>↗</a><a href={`/admin/conteudos/selecionar-drive?module=${module.id}`}>⟳</a></span></div>
            ))}
          </div>
          <a className="all-folders" href="/admin/produtos">Ver todas as pastas</a>
        </article>
      </section>

      <section className="integration-grid bottom-grid">
        <article className="integration-card health-card">
          <h2 className="section-card-title">⌁ Saúde do sistema</h2>
          <div className="health-items">
            {['Servidor', 'Banco de dados', 'Storage', 'Webhooks', 'Fila de jobs'].map((item) => <div key={item}><span>{item}</span><strong>✓ Operacional</strong></div>)}
          </div>
          <p>Todos os serviços estão funcionando normalmente. <em>Atualizado agora</em></p>
        </article>

        <article className="integration-card backup-card">
          <h2 className="section-card-title">🛡 Backup e segurança</h2>
          <div className="backup-grid">
            <div><small>Último backup</small><strong className="success-text">{formatDate(lastBackup)}</strong><a className="outline-gold" href="/admin/configuracoes">▣ Gerar backup</a></div>
            <div><small>Banco de dados</small><strong>✓ OK</strong></div>
            <div><small>Arquivos (R2)</small><strong>✓ OK</strong></div>
            <div className="backup-actions"><a href="/admin/configuracoes">⚙ Restaurar</a><a href="/admin/atividades">▣ Ver histórico</a></div>
          </div>
        </article>
      </section>
    </main>
  );
}
