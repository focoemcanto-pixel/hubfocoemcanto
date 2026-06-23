import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const supabase = createAdminClient();
  const [{ count: products }, { count: students }, { count: subscriptions }, { count: pending }] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
  ]);

  return (
    <main className="admin-page-clean settings-admin-page">
      <section className="admin-clean-hero">
        <div>
          <span className="admin-clean-eyebrow">Configurações</span>
          <h1>Central da escola</h1>
          <p>Visão rápida das integrações e atalhos principais para manter o Hub organizado.</p>
        </div>
        <a className="admin-clean-button secondary" href="/admin">Voltar</a>
      </section>

      <section className="dash-kpis community-kpis">
        <a href="/admin/produtos"><span>Produtos</span><strong>{products || 0}</strong><small>cursos e ofertas</small><em>📦</em></a>
        <a href="/admin/alunos"><span>Alunos</span><strong>{students || 0}</strong><small>perfis cadastrados</small><em>👥</em></a>
        <a href="/admin/premium"><span>Assinaturas</span><strong>{subscriptions || 0}</strong><small>registros de acesso</small><em>♛</em></a>
        <a className="warning" href="/admin/avaliacoes"><span>Pendências</span><strong>{pending || 0}</strong><small>atividades para avaliar</small><em>📋</em></a>
      </section>

      <section className="settings-grid">
        <article className="admin-clean-section">
          <span className="admin-clean-eyebrow">Acesso</span>
          <h2>Webhook Kiwify</h2>
          <p className="admin-clean-muted">Use esta rota para sincronizar compras, renovações, atrasos e cancelamentos.</p>
          <code className="settings-code">https://hub.focoemcanto.com/api/kiwify/webhook</code>
          <a className="admin-clean-button primary" href="/admin/premium">Gerenciar assinaturas</a>
        </article>
        <article className="admin-clean-section">
          <span className="admin-clean-eyebrow">Conteúdo</span>
          <h2>Produtos e cursos</h2>
          <p className="admin-clean-muted">Configure capa, preço, módulos, aulas, importação do Drive e preparação para R2.</p>
          <a className="admin-clean-button primary" href="/admin/produtos">Abrir produtos</a>
        </article>
        <article className="admin-clean-section">
          <span className="admin-clean-eyebrow">Comunidade</span>
          <h2>Interações e envios</h2>
          <p className="admin-clean-muted">Acompanhe publicações, exercícios e fila de avaliações dos alunos.</p>
          <div className="settings-actions"><a className="admin-clean-button secondary" href="/admin/comunidade">Comunidade</a><a className="admin-clean-button secondary" href="/admin/avaliacoes">Avaliações</a></div>
        </article>
      </section>
    </main>
  );
}
