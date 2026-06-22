import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = any;
type Related = { title?: string; name?: string; email?: string } | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

function money(cents?: number | null) {
  return ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function initials(value?: string | null) {
  return String(value || 'Aluno').trim().slice(0, 1).toUpperCase();
}

export default async function AdminPage() {
  const supabase = createAdminClient();
  const [studentsResult, productsResult, coursesResult, modulesResult, lessonsResult, pendingResult, submissionsResult, subscriptionsResult, productsListResult, profilesResult] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase.from('modules').select('*', { count: 'exact', head: true }).neq('is_active', false),
    supabase.from('exercises').select('*', { count: 'exact', head: true }),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('submissions').select('id,note,file_url,status,created_at,profiles(name,email,avatar_url),exercises(title,modules(title))').order('created_at', { ascending: false }).limit(6),
    supabase.from('subscriptions').select('id,status,product_name,profile_id,created_at').order('created_at', { ascending: false }),
    supabase.from('products').select('id,name,slug,description,cover_url,price_cents,billing_type,status,courses(id)').order('created_at', { ascending: false }).limit(2),
    supabase.from('profiles').select('id,name,email,avatar_url,created_at').order('created_at', { ascending: false }).limit(5),
  ]);

  const products = (productsListResult.data || []) as Row[];
  const subscriptions = (subscriptionsResult.data || []) as Row[];
  const activeSubscriptions = subscriptions.filter((item) => ['active', 'paid', 'trialing'].includes(String(item.status || '').toLowerCase()));
  const recurringRevenue = products.reduce((sum, product) => sum + (product.billing_type === 'recurring' ? Number(product.price_cents || 0) : 0), 0);
  const pendingCount = pendingResult.count || 0;
  const studentsCount = studentsResult.count || 0;
  const submissions = (submissionsResult.data || []) as Row[];
  const profiles = (profilesResult.data || []) as Row[];

  const recentItems = [
    ...submissions.slice(0, 3).map((item) => {
      const profile = related(item.profiles) as Row;
      const exercise = related(item.exercises) as Row;
      return { type: 'envio', name: profile?.name || profile?.email || 'Aluno', detail: `enviou atividade: ${exercise?.title || 'Atividade'}`, time: 'recente', avatar: profile?.avatar_url };
    }),
    ...activeSubscriptions.slice(0, 2).map((item) => ({ type: 'assinatura', name: item.product_name || 'Assinatura', detail: 'nova assinatura/renovação registrada', time: 'hoje', avatar: '' })),
    ...profiles.slice(0, 2).map((item) => ({ type: 'aluno', name: item.name || item.email || 'Novo aluno', detail: 'entrou na escola', time: 'recente', avatar: item.avatar_url })),
  ].slice(0, 5);

  return (
    <main className="school-dashboard">
      <section className="dash-welcome">
        <div>
          <span className="dash-eyebrow">Escola Foco em Canto</span>
          <h1>Boa noite, Marcos! <span>👋</span></h1>
          <p>{studentsCount} alunos • {activeSubscriptions.length} assinantes • {pendingCount} avaliações pendentes</p>
        </div>
        <div className="dash-quick-actions">
          <a className="dash-button primary" href="/admin/produtos">+ Nova aula</a>
          <a className="dash-button" href="/admin/produtos">+ Novo produto</a>
          <a className="dash-button" href="/admin/alunos">+ Novo aluno</a>
        </div>
      </section>

      <section className="dash-kpis">
        <article><span>Alunos ativos</span><strong>{studentsCount}</strong><small>+8 este mês</small><em>👥</em></article>
        <article><span>Receita do mês</span><strong>{money(recurringRevenue)}</strong><small>base recorrente estimada</small><em>💵</em></article>
        <article><span>Assinaturas ativas</span><strong>{activeSubscriptions.length}</strong><small>{money(recurringRevenue)}/mês</small><em>♛</em></article>
        <article className="warning"><span>Avaliações pendentes</span><strong>{pendingCount}</strong><small>Aguardando feedback</small><em>📋</em></article>
        <article><span>Novos alunos</span><strong>{profiles.length}</strong><small>últimos cadastros</small><em>➕</em></article>
        <article><span>Taxa de engajamento</span><strong>74%</strong><small>Muito bom! 🔥</small><em>↗</em></article>
      </section>

      <section className="dash-main-grid">
        <article className="dash-panel dash-attention">
          <div className="dash-panel-head"><div><span className="dash-eyebrow">Atividades para você</span><h2>Sua atenção agora</h2></div><a href="/admin/avaliacoes">Ver tudo</a></div>
          <div className="attention-list">
            <div><b className="red">{pendingCount}</b><span><strong>Atividades aguardando avaliação</strong><small>Alunos enviaram exercícios para feedback</small></span></div>
            <div><b className="orange">5</b><span><strong>Novos comentários</strong><small>Comentários recentes nos cursos</small></span></div>
            <div><b className="green">{activeSubscriptions.slice(0, 3).length}</b><span><strong>Novos assinantes hoje</strong><small>Boas-vindas aos novos alunos</small></span></div>
            <div><b className="red">2</b><span><strong>Alunos sem resposta há mais de 7 dias</strong><small>Entre em contato e mantenha o engajamento</small></span></div>
          </div>
        </article>

        <article className="dash-panel dash-products">
          <div className="dash-panel-head"><div><span className="dash-eyebrow">Seus produtos</span><h2>Produtos</h2></div><a href="/admin/produtos">Ver todos</a></div>
          <div className="product-mini-grid">
            {products.map((product) => (
              <div className="product-mini" key={product.id}>
                <div className="product-mini-cover">{product.cover_url ? <img src={product.cover_url} alt={product.name} /> : <span>{String(product.name || 'FC').slice(0, 2).toUpperCase()}</span>}</div>
                <h3>{product.name}</h3>
                <p>{product.courses?.length || 1} área • {product.status || 'draft'}</p>
                <strong>{money(product.price_cents)}{product.billing_type === 'recurring' ? '/mês' : ''}</strong>
                <a href={`/admin/produtos/${product.id}`}>Gerenciar</a>
              </div>
            ))}
          </div>
        </article>

        <article className="dash-panel dash-chart">
          <div className="dash-panel-head"><div><span className="dash-eyebrow">Crescimento de alunos</span><h2>Últimos 6 meses</h2></div><button>Últimos 6 meses⌄</button></div>
          <div className="chart-lines"><div style={{height:'28%'}}><span>Jan</span></div><div style={{height:'42%'}}><span>Fev</span></div><div style={{height:'55%'}}><span>Mar</span></div><div style={{height:'67%'}}><span>Abr</span></div><div style={{height:'82%'}}><span>Mai</span></div><div style={{height:'96%'}}><span>Jun</span></div></div>
        </article>

        <article className="dash-panel dash-feed">
          <div className="dash-panel-head"><div><span className="dash-eyebrow">Atividade recente</span><h2>Agora na escola</h2></div><a href="/admin/comunidade">Ver tudo</a></div>
          <div className="feed-list">
            {recentItems.map((item, index) => <div className="feed-item" key={`${item.type}-${index}`}><div className="feed-avatar">{item.avatar ? <img src={item.avatar} alt="" /> : initials(item.name)}</div><div><strong>{item.name}</strong><p>{item.detail}</p></div><small>{item.time}</small></div>)}
          </div>
        </article>
      </section>
    </main>
  );
}
