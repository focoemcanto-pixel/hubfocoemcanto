import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = any;
type Related = { title?: string; name?: string; email?: string; avatar_url?: string } | null;
type Search = { range?: string };

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

function monthLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

function timeAgo(value?: string | null) {
  if (!value) return 'recente';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

function isActive(status?: string | null) {
  return ['active', 'paid', 'trialing', 'approved'].includes(String(status || '').toLowerCase());
}

function estimateRevenue(activeSubscriptions: Row[], products: Row[]) {
  return activeSubscriptions.reduce((sum, sub) => {
    const subName = String(sub.product_name || '').toLowerCase();
    const product = products.find((item) => subName && (subName.includes(String(item.name || '').toLowerCase()) || String(item.name || '').toLowerCase().includes(subName)));
    return sum + Number(product?.price_cents || 0);
  }, 0);
}

function growthBuckets(profiles: Row[], months: number) {
  const now = new Date();
  const buckets = Array.from({ length: months }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: monthLabel(date), count: 0 };
  });
  profiles.forEach((profile) => {
    const created = new Date(profile.created_at || Date.now());
    const key = `${created.getFullYear()}-${created.getMonth()}`;
    const bucket = buckets.find((item) => item.key === key);
    if (bucket) bucket.count += 1;
  });
  const max = Math.max(1, ...buckets.map((item) => item.count));
  return buckets.map((item) => ({ ...item, height: Math.max(8, Math.round((item.count / max) * 96)) }));
}

export default async function AdminPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const query = searchParams ? await searchParams : {};
  const range = [3, 6, 12].includes(Number(query.range)) ? Number(query.range) : 6;
  const supabase = createAdminClient();
  const [studentsResult, pendingResult, submissionsResult, subscriptionsResult, productsListResult, profilesResult, reviewsResult, commentsResult] = await Promise.all([
    supabase.from('profiles').select('id,name,email,avatar_url,created_at', { count: 'exact' }).order('created_at', { ascending: false }),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('submissions').select('id,note,file_url,status,created_at,profiles(name,email,avatar_url),exercises(title,modules(title))').order('created_at', { ascending: false }).limit(8),
    supabase.from('subscriptions').select('id,status,product_name,profile_id,created_at,current_period_end').order('created_at', { ascending: false }),
    supabase.from('products').select('id,name,slug,description,cover_url,price_cents,billing_type,status,courses(id)').order('created_at', { ascending: false }).limit(4),
    supabase.from('profiles').select('id,name,email,avatar_url,created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('reviews').select('id,created_at', { count: 'exact', head: true }),
    supabase.from('community_posts').select('id,created_at', { count: 'exact', head: true }),
  ]);

  const products = (productsListResult.data || []) as Row[];
  const subscriptions = (subscriptionsResult.data || []) as Row[];
  const activeSubscriptions = subscriptions.filter((item) => isActive(item.status));
  const revenue = estimateRevenue(activeSubscriptions, products);
  const pendingCount = pendingResult.count || 0;
  const students = (studentsResult.data || []) as Row[];
  const studentsCount = studentsResult.count || 0;
  const profiles = (profilesResult.data || []) as Row[];
  const submissions = (submissionsResult.data || []) as Row[];
  const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const newStudentsThisMonth = profiles.filter((item) => new Date(item.created_at || 0).getTime() >= thisMonth).length;
  const reviewsCount = reviewsResult.count || 0;
  const engagementRate = studentsCount ? Math.round((reviewsCount / studentsCount) * 100) : 0;
  const buckets = growthBuckets(profiles, range);
  const commentsCount = commentsResult.count || 0;

  const recentItems = [
    ...submissions.map((item) => {
      const profile = related(item.profiles) as Row;
      const exercise = related(item.exercises) as Row;
      return { type: 'envio', name: profile?.name || profile?.email || 'Aluno', detail: `enviou atividade: ${exercise?.title || 'Atividade'}`, time: timeAgo(item.created_at), avatar: profile?.avatar_url };
    }),
    ...subscriptions.slice(0, 4).map((item) => ({ type: 'assinatura', name: item.product_name || 'Assinatura', detail: `${isActive(item.status) ? 'assinatura ativa' : 'assinatura registrada'} · ${item.status || 'sem status'}`, time: timeAgo(item.created_at), avatar: '' })),
    ...students.slice(0, 4).map((item) => ({ type: 'aluno', name: item.name || item.email || 'Novo aluno', detail: 'entrou na escola', time: timeAgo(item.created_at), avatar: item.avatar_url })),
  ].sort((a, b) => 0).slice(0, 6);

  return (
    <main className="school-dashboard">
      <section className="dash-welcome">
        <div>
          <span className="dash-eyebrow">Escola Foco em Canto</span>
          <h1>Boa noite, Marcos! <span>👋</span></h1>
          <p>{studentsCount} alunos • {activeSubscriptions.length} assinantes ativos • {pendingCount} avaliações pendentes</p>
        </div>
        <div className="dash-quick-actions">
          <a className="dash-button primary" href="/admin/produtos">+ Nova aula</a>
          <a className="dash-button" href="/admin/produtos">+ Novo produto</a>
          <a className="dash-button" href="/admin/alunos#novo-aluno">+ Novo aluno</a>
        </div>
      </section>

      <section className="dash-kpis">
        <a href="/admin/alunos"><span>Alunos cadastrados</span><strong>{studentsCount}</strong><small>{newStudentsThisMonth} este mês</small><em>👥</em></a>
        <a href="/admin/premium"><span>Receita recorrente</span><strong>{money(revenue)}</strong><small>estimada por assinantes ativos</small><em>💵</em></a>
        <a href="/admin/premium"><span>Assinaturas ativas</span><strong>{activeSubscriptions.length}</strong><small>{subscriptions.length} assinaturas no total</small><em>♛</em></a>
        <a className="warning" href="/admin/avaliacoes"><span>Avaliações pendentes</span><strong>{pendingCount}</strong><small>Aguardando feedback</small><em>📋</em></a>
        <a href="/admin/alunos"><span>Novos alunos</span><strong>{newStudentsThisMonth}</strong><small>cadastros no mês atual</small><em>➕</em></a>
        <a href="/admin/atividades"><span>Engajamento</span><strong>{engagementRate}%</strong><small>{reviewsCount} avaliações registradas</small><em>↗</em></a>
      </section>

      <section className="dash-main-grid">
        <article className="dash-panel dash-attention">
          <div className="dash-panel-head"><div><span className="dash-eyebrow">Atividades para você</span><h2>Sua atenção agora</h2></div><a href="/admin/atividades">Ver tudo</a></div>
          <div className="attention-list">
            <a href="/admin/avaliacoes"><b className="red">{pendingCount}</b><span><strong>Atividades aguardando avaliação</strong><small>Envios reais pendentes de feedback</small></span></a>
            <a href="/admin/atividades"><b className="orange">{commentsCount}</b><span><strong>Publicações/comentários da comunidade</strong><small>Movimento registrado na comunidade</small></span></a>
            <a href="/admin/premium"><b className="green">{activeSubscriptions.length}</b><span><strong>Assinaturas ativas</strong><small>Alunos com acesso ativo</small></span></a>
            <a href="/admin/alunos"><b className="gold">{newStudentsThisMonth}</b><span><strong>Novos alunos este mês</strong><small>Acompanhe onboarding e acolhimento</small></span></a>
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
          <div className="dash-panel-head"><div><span className="dash-eyebrow">Crescimento de alunos</span><h2>Últimos {range} meses</h2></div><div className="dash-filter"><a className={range === 3 ? 'active' : ''} href="/admin?range=3">3m</a><a className={range === 6 ? 'active' : ''} href="/admin?range=6">6m</a><a className={range === 12 ? 'active' : ''} href="/admin?range=12">12m</a></div></div>
          <div className="chart-lines">{buckets.map((bucket) => <div key={bucket.key} style={{ height: `${bucket.height}%` }}><strong>{bucket.count}</strong><span>{bucket.label}</span></div>)}</div>
        </article>

        <article className="dash-panel dash-feed">
          <div className="dash-panel-head"><div><span className="dash-eyebrow">Atividade recente</span><h2>Agora na escola</h2></div><a href="/admin/atividades">Ver tudo</a></div>
          <div className="feed-list">
            {recentItems.map((item, index) => <div className="feed-item" key={`${item.type}-${index}`}><div className="feed-avatar">{item.avatar ? <img src={item.avatar} alt="" /> : initials(item.name)}</div><div><strong>{item.name}</strong><p>{item.detail}</p></div><small>{item.time}</small></div>)}
          </div>
        </article>
      </section>
    </main>
  );
}
