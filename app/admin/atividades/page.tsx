import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = any;

function related(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function initials(value?: string | null) {
  return String(value || 'A').trim().slice(0, 1).toUpperCase();
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

export default async function AdminActivitiesPage() {
  const supabase = createAdminClient();
  const [submissionsResult, subscriptionsResult, profilesResult] = await Promise.all([
    supabase.from('submissions').select('id,status,note,file_url,created_at,profiles(name,email,avatar_url),exercises(title,modules(title))').order('created_at', { ascending: false }).limit(40),
    supabase.from('subscriptions').select('id,status,product_name,created_at,profiles(name,email,avatar_url)').order('created_at', { ascending: false }).limit(25),
    supabase.from('profiles').select('id,name,email,avatar_url,created_at').order('created_at', { ascending: false }).limit(25),
  ]);

  const items = [
    ...((submissionsResult.data || []) as Row[]).map((item) => {
      const profile = related(item.profiles) as Row;
      const exercise = related(item.exercises) as Row;
      return { id: `sub-${item.id}`, date: item.created_at, label: 'Envio', title: profile?.name || profile?.email || 'Aluno', detail: `enviou ${exercise?.title || 'uma atividade'} para avaliação`, status: item.status, href: item.file_url || '/admin/avaliacoes', avatar: profile?.avatar_url };
    }),
    ...((subscriptionsResult.data || []) as Row[]).map((item) => {
      const profile = related(item.profiles) as Row;
      return { id: `subscr-${item.id}`, date: item.created_at, label: 'Assinatura', title: profile?.name || profile?.email || item.product_name || 'Assinante', detail: `${item.product_name || 'Produto'} · ${item.status || 'sem status'}`, status: item.status, href: '/admin/premium', avatar: profile?.avatar_url };
    }),
    ...((profilesResult.data || []) as Row[]).map((item) => ({ id: `profile-${item.id}`, date: item.created_at, label: 'Aluno', title: item.name || item.email || 'Novo aluno', detail: 'cadastro criado na escola', status: 'novo', href: `/admin/alunos?q=${encodeURIComponent(item.email || item.name || '')}`, avatar: item.avatar_url })),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 60);

  return (
    <main className="admin-page-clean admin-activities-page">
      <section className="admin-clean-hero">
        <div><span className="admin-clean-eyebrow">Atividades</span><h1>Agora na escola</h1><p>Tudo que está acontecendo no Hub: envios, novos alunos e assinaturas.</p></div>
        <a className="admin-clean-button secondary" href="/admin">Voltar</a>
      </section>
      <section className="admin-clean-section">
        <div className="admin-clean-heading"><div><span className="admin-clean-eyebrow">Feed</span><h2>Atividade recente</h2></div></div>
        <div className="admin-activity-timeline">
          {items.map((item) => <a className="admin-activity-item" href={item.href} key={item.id}><div className="feed-avatar">{item.avatar ? <img src={item.avatar} alt="" /> : initials(item.title)}</div><div><span>{item.label} · {item.status}</span><h3>{item.title}</h3><p>{item.detail}</p></div><small>{timeAgo(item.date)}</small></a>)}
          {!items.length ? <p className="admin-clean-muted">Nenhuma atividade recente encontrada.</p> : null}
        </div>
      </section>
    </main>
  );
}
