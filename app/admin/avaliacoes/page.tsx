import { BarChart3, CheckCircle2, Clock3, Music2, RefreshCcw, Search, SlidersHorizontal, Sparkles, Star, Zap } from 'lucide-react';
import { DeleteReviewSubmissionButton } from '@/components/admin/delete-review-submission-button';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Related = { title?: string; name?: string; email?: string; modules?: unknown; avatar_url?: string } | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

function statusLabel(value?: string | null) {
  if (value === 'approved') return 'Aprovada';
  if (value === 'needs_rework') return 'Refação';
  if (value === 'reviewed') return 'Avaliada';
  return 'Pendente';
}

function statusClass(value?: string | null) {
  if (value === 'approved') return 'approved';
  if (value === 'needs_rework') return 'rework';
  if (value === 'reviewed') return 'reviewed';
  return 'pending';
}

function initials(name?: string | null) {
  const value = String(name || 'Aluno').trim();
  return value.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function timeAgo(value?: string | null) {
  if (!value) return 'agora';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(value).toLocaleDateString('pt-BR');
}

function matchSearch(item: any, term: string) {
  if (!term) return true;
  const exercise = related(item.exercises);
  const module = related(exercise?.modules);
  const profile = related(item.profiles);
  const content = [exercise?.title, module?.title, profile?.name, profile?.email, item.note, item.status].join(' ').toLowerCase();
  return content.includes(term.toLowerCase());
}

const filters = [
  { label: 'Todas', value: 'all' },
  { label: 'Pendentes', value: 'pending_review' },
  { label: 'Aprovadas', value: 'approved' },
  { label: 'Refações', value: 'needs_rework' },
];

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string; sucesso?: string; erro?: string; q?: string }> }) {
  const params = await searchParams;
  const status = params.status || 'pending_review';
  const q = String(params.q || '').trim();
  const supabase = createAdminClient();

  let query = supabase.from('submissions').select('id,note,file_url,file_type,visibility,status,created_at,profiles(name,email,avatar_url),exercises(title,modules(title))').order('created_at', { ascending: false }).limit(120);
  if (status !== 'all') query = query.eq('status', status);

  const [{ data: rawSubmissions }, { count: pending }, { count: approved }, { count: rework }, { count: total }] = await Promise.all([
    query,
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'needs_rework'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }),
  ]);

  const submissions = (rawSubmissions || []).filter((item: any) => matchSearch(item, q));
  const pendingItems = submissions.filter((item: any) => item.status === 'pending_review');
  const nextPending = pendingItems[0] || submissions[0];
  const approvalRate = total ? Math.round(((approved || 0) / total) * 100) : 0;
  const withQuery = (nextStatus: string) => `/admin/avaliacoes?status=${nextStatus}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <main className="reviews-premium-shell reviews-command-center reviews-no-subnav">
      <section className="reviews-premium-hero reviews-gold-hero">
        <div className="reviews-hero-copy">
          <p className="eyebrow"><Sparkles size={16} /> Avaliações</p>
          <h1>Fila premium <span>de atividades</span></h1>
          <p>Avalie com eficiência, acompanhe a evolução dos alunos e mantenha sua fila organizada com uma experiência de plataforma premium.</p>
        </div>
        <div className="reviews-hero-orb" aria-hidden="true"><div className="reviews-orb-ring"><Star size={58} fill="currentColor" /></div></div>
      </section>

      {params.sucesso ? <div className="notice success reviews-notice">Ação concluída com sucesso.</div> : null}
      {params.erro ? <div className="notice danger reviews-notice">Erro: {params.erro}</div> : null}

      <section className="reviews-stat-grid reviews-stat-dashboard">
        <article className="reviews-stat"><Clock3 size={28} /><span>Pendentes</span><strong>{pending || 0}</strong><small>Aguardando avaliação</small></article>
        <article className="reviews-stat"><CheckCircle2 size={28} /><span>Aprovadas</span><strong>{approved || 0}</strong><small>Prontas</small></article>
        <article className="reviews-stat"><RefreshCcw size={28} /><span>Refações</span><strong>{rework || 0}</strong><small>Para revisar</small></article>
        <article className="reviews-stat"><BarChart3 size={28} /><span>Total</span><strong>{total || 0}</strong><small>{approvalRate}% aprovadas</small></article>
      </section>

      <section className="reviews-board reviews-premium-table">
        <div className="reviews-board-head">
          <div><p className="eyebrow">Correção</p><h2>Envios recebidos</h2><p className="muted">Use a fila para avaliar, aprovar, pedir refação ou excluir envios incorretos.</p></div>
          <div className="reviews-board-tools">
            <div className="reviews-filter-pills">{filters.map((item) => <a className={status === item.value ? 'active' : ''} href={withQuery(item.value)} key={item.value}>{item.label}{item.value === 'needs_rework' ? <b>{rework || 0}</b> : null}</a>)}</div>
            <form className="reviews-search" action="/admin/avaliacoes"><input type="hidden" name="status" value={status} /><Search size={18} /><input name="q" defaultValue={q} placeholder="Buscar por aluno ou atividade..." />{q ? <a href={`/admin/avaliacoes?status=${status}`}>limpar</a> : null}</form>
            <button className="reviews-filter-button" type="button" aria-label="Filtros"><SlidersHorizontal size={20} /></button>
          </div>
        </div>

        <div className="reviews-table-head"><span>Atividade</span><span>Aluno</span><span>Data</span><span>Status</span><span>Ação</span></div>
        <div className="reviews-queue">
          {submissions.map((item: any) => {
            const exercise = related(item.exercises);
            const module = related(exercise?.modules);
            const profile = related(item.profiles);
            const profileName = profile?.name || profile?.email || 'Aluno VIP';
            return (
              <article className={`reviews-submission-card ${statusClass(item.status)}`} key={item.id}>
                <a className="reviews-card-click" href={`/admin/avaliacoes/${item.id}`} aria-label="Avaliar atividade" />
                <div className="reviews-activity-cell"><div className="reviews-thumb">{item.file_url ? <video src={item.file_url} muted playsInline preload="metadata" /> : <span>sem vídeo</span>}<em>▶</em></div><div><h3>{exercise?.title || 'Atividade enviada'}</h3><p>Dueto • {module?.title || 'Módulo'}</p><div className="reviews-tags"><span><Music2 size={13} /> Música</span><span>Segunda voz</span></div></div></div>
                <div className="reviews-student-cell"><span className="reviews-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt={profileName} /> : initials(profileName)}</span><div><strong>{profileName}</strong><small>{profile?.email || '@aluno'}</small></div></div>
                <div className="reviews-date-cell"><span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span><small>{timeAgo(item.created_at)}</small></div>
                <div><span className={`reviews-status-pill ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></div>
                <div className="reviews-row-actions"><a href={`/admin/avaliacoes/${item.id}`}>Avaliar</a><DeleteReviewSubmissionButton id={item.id} /></div>
              </article>
            );
          })}
          {!submissions.length ? <div className="reviews-empty"><h3>Tudo em dia</h3><p className="muted">Nenhuma atividade encontrada nesta fila.</p></div> : null}
        </div>
      </section>

      <section className="reviews-bottom-cta"><span><Sparkles size={20} /> Mantenha sua fila em dia e impulsione a evolução dos seus alunos.</span>{nextPending ? <a href={`/admin/avaliacoes/${nextPending.id}`}><Zap size={18} fill="currentColor" /> Avaliar agora</a> : <a href="/admin/avaliacoes">Fila vazia</a>}</section>
    </main>
  );
}
