import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const fallbackCovers = [
  'linear-gradient(160deg, rgba(245,199,107,.22), rgba(0,0,0,.55)), radial-gradient(circle at 70% 20%, rgba(245,199,107,.28), transparent 34%), linear-gradient(135deg,#1b1410,#08080d)',
  'linear-gradient(160deg, rgba(116,87,255,.22), rgba(0,0,0,.55)), radial-gradient(circle at 70% 20%, rgba(116,87,255,.3), transparent 34%), linear-gradient(135deg,#111827,#06060a)',
  'linear-gradient(160deg, rgba(46,213,170,.18), rgba(0,0,0,.58)), radial-gradient(circle at 68% 24%, rgba(46,213,170,.28), transparent 36%), linear-gradient(135deg,#071412,#05050a)',
  'linear-gradient(160deg, rgba(245,199,107,.2), rgba(0,0,0,.6)), radial-gradient(circle at 70% 20%, rgba(245,199,107,.25), transparent 34%), linear-gradient(135deg,#20160e,#05050a)',
];

const demoFeed = [
  { name: 'Ana Beatriz', track: 'Duetos para Treino', title: 'Tu És Fiel Senhor', caption: 'Enviei minha segunda voz para avaliação.', rating: '5.0', comments: 8, likes: 32 },
  { name: 'Carlos Henrique', track: 'Firmar Afinação', title: 'Exercício de Afinação 01', caption: 'Treino para manter a nota firme.', rating: '4.0', comments: 4, likes: 18 },
];

function getRelated(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function isRealModule(module: any) {
  const description = String(module.description || '').toLowerCase();
  return description.indexOf('importados da pasta') === -1;
}

function progressFor(index: number) {
  return [75, 40, 12, 10, 25, 18][index % 6];
}

export default async function StudentPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();

  const [{ data: rawModules }, { data: profile }, { data: posts }, { count: lessonsCount }, { data: profileFull }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,cover_url,icon,sort_order,exercises(id)').eq('is_active', true).order('sort_order'),
    email ? supabase.from('profiles').select('name,email').eq('email', email).maybeSingle() : { data: null },
    supabase.from('community_posts').select('id,caption,media_url,likes_count,comments_count,created_at,profiles(name),exercises(title)').order('created_at', { ascending: false }).limit(10),
    supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('is_active', true),
    email ? supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null },
  ]);

  const modules = (rawModules || []).filter(isRealModule);
  const profileId = profileFull?.id;
  const [{ count: submittedCount }, { data: reviews }] = await Promise.all([
    profileId ? supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('profile_id', profileId) : { count: 0 },
    profileId
      ? supabase.from('submissions').select('reviews(rating,pitch_rating,rhythm_rating,harmony_rating,confidence_rating)').eq('profile_id', profileId)
      : { data: [] },
  ]);

  const ratings = ((reviews || []) as any[])
    .flatMap((item) => item.reviews || [])
    .flatMap((review) => [review.rating, review.pitch_rating, review.rhythm_rating, review.harmony_rating, review.confidence_rating])
    .filter((value) => typeof value === 'number' && value > 0);
  const average = ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1) : '—';
  const feedItems = posts && posts.length > 0 ? posts : demoFeed;
  const firstName = profile?.name ? profile.name.split(' ')[0] : 'Marcos';
  const totalLessons = lessonsCount || modules.reduce((sum: number, module: any) => sum + (module.exercises?.length || 0), 0);

  return (
    <AppShell>
      <main className="page app-home premium-student-home">
        <section className="premium-hero">
          <div className="premium-hero-copy">
            <p className="eyebrow">Grupo VIP Foco em Harmonia ★</p>
            <h1>Olá, {firstName}.<br />Escolha seu treino de hoje.</h1>
            <p>Biblioteca premium com aulas, áudios e duetos organizados por objetivo.</p>
            <div className="hero-actions">
              <a className="premium-button gold" href="/aluno/biblioteca">▶ Abrir biblioteca</a>
              <a className="premium-button dark" href="/aluno/perfil">Ver avaliações</a>
            </div>
          </div>
          <div className="premium-hero-photo" aria-hidden="true">
            <div className="singer-silhouette" />
          </div>
          <div className="hero-icons">
            <span>🔔</span>
            <span>{firstName[0]}</span>
          </div>
        </section>

        <section className="premium-stats">
          <article><span>〽</span><strong>{modules.length}</strong><p>módulos</p></article>
          <article><span>🎓</span><strong>{totalLessons}</strong><p>aulas disponíveis</p></article>
          <article><span>⭐</span><strong>{average}</strong><p>média geral</p></article>
          <article><span>🔥</span><strong>{submittedCount || 0}</strong><p>atividades enviadas</p></article>
        </section>

        <section className="premium-continue-panel">
          <div className="premium-section-heading">
            <h2>Continue evoluindo</h2>
            <a href="/aluno/biblioteca">Ver todos →</a>
          </div>
          <div className="premium-course-row">
            {modules.slice(0, 6).map((module: any, index: number) => {
              const progress = progressFor(index);
              return (
                <a className="premium-course-card" key={module.id} href={`/aluno/biblioteca/${module.slug}`}>
                  <div
                    className="course-cover"
                    style={module.cover_url ? { backgroundImage: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,.35) 42%, rgba(0,0,0,.88) 100%), url(${module.cover_url})` } : { background: fallbackCovers[index % fallbackCovers.length] }}
                  >
                    {index === 0 ? <span className="course-badge">Em andamento</span> : null}
                    <strong>{module.title}</strong>
                  </div>
                  <div className="course-meta">
                    <span>{module.exercises?.length || 0} aulas</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress"><span style={{ width: `${progress}%` }} /></div>
                </a>
              );
            })}
          </div>
        </section>

        <section className="feed-layout premium-community-feed">
          <div className="section-heading">
            <div><p className="eyebrow">Comunidade VIP</p><h2>Atividades recentes</h2></div>
            <a href="/aluno/comunidade">Abrir comunidade</a>
          </div>

          <div className="feed-list">
            {feedItems.map((post: any, index: number) => {
              const exercise = getRelated(post.exercises);
              const author = getRelated(post.profiles);
              return (
                <article className="feed-card" key={post.id || index}>
                  <div className="feed-header">
                    <div className="avatar">{(author?.name || post.name || 'A')[0]}</div>
                    <div><strong>{author?.name || post.name}</strong><span>{exercise?.title || post.title} - {post.track || 'Atividade'}</span></div>
                  </div>
                  {post.media_url ? <video className="feed-video" src={post.media_url} controls playsInline /> : <div className="media-placeholder"><span>Play</span><p>{exercise?.title || post.title}</p></div>}
                  <p>{post.caption}</p>
                  <div className="feed-meta"><span>Nota {post.rating || '5.0'}</span><span>{post.likes_count || post.likes} curtidas</span><span>{post.comments_count || post.comments} comentários</span></div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
