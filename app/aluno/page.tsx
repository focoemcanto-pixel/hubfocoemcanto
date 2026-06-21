import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { HomeCommunityFeed } from '@/components/home-community-feed';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const studentHeroImage = process.env.NEXT_PUBLIC_STUDENT_HERO_IMAGE || '/images/aluno-hero.jpg';
const fallbackCovers = [
  'linear-gradient(160deg, rgba(245,199,107,.22), rgba(0,0,0,.55)), radial-gradient(circle at 70% 20%, rgba(245,199,107,.28), transparent 34%), linear-gradient(135deg,#1b1410,#08080d)',
  'linear-gradient(160deg, rgba(116,87,255,.22), rgba(0,0,0,.55)), radial-gradient(circle at 70% 20%, rgba(116,87,255,.3), transparent 34%), linear-gradient(135deg,#111827,#06060a)',
  'linear-gradient(160deg, rgba(46,213,170,.18), rgba(0,0,0,.58)), radial-gradient(circle at 68% 24%, rgba(46,213,170,.28), transparent 36%), linear-gradient(135deg,#071412,#05050a)',
  'linear-gradient(160deg, rgba(245,199,107,.2), rgba(0,0,0,.6)), radial-gradient(circle at 70% 20%, rgba(245,199,107,.25), transparent 34%), linear-gradient(135deg,#20160e,#05050a)',
];

const premiumHomeCss = `
.premium-student-home{max-width:1040px;padding-top:8px}.bottom-nav{grid-template-columns:repeat(4,1fr);width:min(520px,calc(100% - 24px))}.premium-hero{position:relative;min-height:330px;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:32px;background:radial-gradient(circle at 72% 32%,rgba(245,199,107,.2),transparent 35%),linear-gradient(90deg,rgba(0,0,0,.9) 0%,rgba(0,0,0,.78) 42%,rgba(28,20,13,.52) 100%);box-shadow:0 34px 110px rgba(0,0,0,.48);padding:42px 44px;display:grid;grid-template-columns:minmax(0,1fr) 420px;align-items:center}.premium-hero:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.2) 52%,rgba(0,0,0,.64)),radial-gradient(circle at 78% 70%,rgba(245,199,107,.22),transparent 30%);pointer-events:none}.premium-hero-copy{position:relative;z-index:2}.premium-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(44px,6.2vw,66px);line-height:.92;margin:12px 0 14px;letter-spacing:-.045em}.premium-hero p:not(.eyebrow){max-width:430px;color:#b9b9c3;line-height:1.45}.premium-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 22px;border-radius:18px;font-weight:900;border:1px solid rgba(255,255,255,.12);box-shadow:0 14px 34px rgba(0,0,0,.3)}.premium-button.gold{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07}.premium-button.dark{background:rgba(255,255,255,.08);color:#fff}.premium-hero-photo{position:absolute;right:0;top:0;bottom:0;width:52%;z-index:1;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.18) 38%,rgba(0,0,0,.34)),radial-gradient(circle at 62% 44%,rgba(245,199,107,.34),transparent 28%),var(--student-hero-image);background-size:cover;background-position:center right}.hero-icons{position:absolute;right:28px;top:26px;z-index:3;display:flex;gap:12px}.hero-icons span{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:rgba(10,10,10,.62);border:1px solid rgba(255,255,255,.16);font-weight:900}.premium-continue-panel{margin-top:22px;border:1px solid rgba(255,255,255,.12);border-radius:26px;background:rgba(255,255,255,.035);padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.22)}.premium-section-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}.premium-section-heading h2{margin:0;font-size:25px}.premium-section-heading a{color:#f5c76b;font-weight:900}.premium-course-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.premium-course-card{position:relative;min-height:190px;border:1px solid rgba(255,255,255,.1);border-radius:18px;overflow:hidden;background:#111;transition:transform .2s,border-color .2s}.premium-course-card:hover{transform:translateY(-4px);border-color:rgba(245,199,107,.75)}.course-cover{height:145px;background-size:cover;background-position:center;display:flex;align-items:flex-end;padding:14px;position:relative}.course-cover strong{font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:.95;text-transform:uppercase;text-shadow:0 4px 22px #000}.course-badge{position:absolute;left:10px;top:10px;border:1px solid rgba(245,199,107,.65);border-radius:999px;background:rgba(245,199,107,.18);color:#f5c76b;text-transform:uppercase;font-size:10px;font-weight:900;padding:6px 8px}.course-meta{display:flex;justify-content:space-between;padding:9px 12px 6px;color:#c7c7d1;font-size:12px}.premium-course-card .progress{margin:0 12px 12px;height:6px}.premium-community-feed{margin-top:30px}@media(max-width:900px){.premium-hero{grid-template-columns:1fr;min-height:380px;padding:30px 24px}.premium-hero-photo{opacity:.42;width:70%}.premium-course-row{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.premium-hero h1{font-size:42px}.premium-hero-photo{display:none}.premium-hero{min-height:auto}.hero-icons{display:none}.premium-continue-panel{padding:18px 0 18px 18px;overflow:hidden}.premium-section-heading{padding-right:18px}.premium-course-row{display:flex;grid-template-columns:none;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:0 18px 8px 0;margin-right:-18px}.premium-course-row::-webkit-scrollbar{display:none}.premium-course-card{flex:0 0 min(82vw,340px);scroll-snap-align:start;min-height:0}.course-cover{height:205px}.course-cover strong{font-size:31px}}
`;

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

  const [{ data: rawModules }, { data: profile }, { data: posts }, { data: communitySubmissions }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,cover_url,icon,sort_order,exercises(id)').eq('is_active', true).order('sort_order'),
    email ? supabase.from('profiles').select('id,name,email').eq('email', email).maybeSingle() : { data: null },
    supabase.from('community_posts').select('id,profile_id,exercise_id,caption,media_url,likes_count,comments_count,created_at,profiles(name,avatar_url),exercises(title,slug),submissions(file_url)').order('created_at', { ascending: false }).limit(10),
    supabase.from('submissions').select('profile_id,exercise_id,file_url,created_at').eq('visibility', 'community').order('created_at', { ascending: false }).limit(100),
  ]);

  const modules = (rawModules || []).filter(isRealModule);
  const firstName = profile?.name ? profile.name.split(' ')[0] : 'Marcos';
  const authorIds = Array.from(new Set((posts || []).map((post: any) => post.profile_id).filter(Boolean)));
  const { data: follows } = profile?.id && authorIds.length
    ? await supabase.from('community_follows').select('following_id').eq('follower_id', profile.id).in('following_id', authorIds)
    : { data: [] };
  const followingIds = new Set((follows || []).map((follow: any) => follow.following_id));

  const fallbackSubmissionByKey = new Map<string, string>();
  (communitySubmissions || []).forEach((submission: any) => {
    const key = `${submission.profile_id}:${submission.exercise_id}`;
    if (!fallbackSubmissionByKey.has(key) && submission.file_url) fallbackSubmissionByKey.set(key, submission.file_url);
  });

  const feedPosts = (posts || []).map((post: any) => {
    const exercise = getRelated(post.exercises) as any;
    const author = getRelated(post.profiles) as any;
    const submission = getRelated(post.submissions) as any;
    const fallbackMedia = fallbackSubmissionByKey.get(`${post.profile_id}:${post.exercise_id}`) || '';
    return {
      id: post.id,
      authorId: post.profile_id,
      authorName: author?.name || 'Aluno VIP',
      authorAvatarUrl: author?.avatar_url || null,
      createdAt: post.created_at,
      exerciseTitle: exercise?.title || 'Atividade da comunidade',
      exerciseSlug: exercise?.slug || null,
      caption: post.caption || 'Compartilhou uma prática.',
      mediaUrl: post.media_url || submission?.file_url || fallbackMedia || null,
      likesCount: post.likes_count || 0,
      commentsCount: post.comments_count || 0,
      canDelete: Boolean(profile?.id && profile.id === post.profile_id),
      isFollowing: followingIds.has(post.profile_id),
    };
  });

  return (
    <AppShell>
      <main className="page app-home premium-student-home">
        <style dangerouslySetInnerHTML={{ __html: premiumHomeCss }} />
        <section className="premium-hero">
          <div className="premium-hero-copy">
            <p className="eyebrow">Grupo VIP Foco em Harmonia ★</p>
            <h1>Olá, {firstName}.<br />Escolha seu treino de hoje.</h1>
            <p>Biblioteca premium com aulas, áudios e duetos organizados por objetivo.</p>
            <div className="hero-actions"><a className="premium-button gold" href="/aluno/biblioteca">▶ Abrir biblioteca</a><a className="premium-button dark" href="/aluno/perfil">Ver avaliações</a></div>
          </div>
          <div className="premium-hero-photo" aria-hidden="true" style={{ '--student-hero-image': `url(${studentHeroImage})` } as React.CSSProperties} />
          <div className="hero-icons"><span>🔔</span><span>{firstName[0]}</span></div>
        </section>

        <section className="premium-continue-panel">
          <div className="premium-section-heading"><h2>Continue evoluindo</h2><a href="/aluno/biblioteca">Ver todos →</a></div>
          <div className="premium-course-row">
            {modules.slice(0, 6).map((module: any, index: number) => {
              const progress = progressFor(index);
              return <a className="premium-course-card" key={module.id} href={`/aluno/biblioteca/${module.slug}`}><div className="course-cover" style={module.cover_url ? { backgroundImage: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,.35) 42%, rgba(0,0,0,.88) 100%), url(${module.cover_url})` } : { background: fallbackCovers[index % fallbackCovers.length] }}>{index === 0 ? <span className="course-badge">Em andamento</span> : null}<strong>{module.title}</strong></div><div className="course-meta"><span>{module.exercises?.length || 0} aulas</span><span>{progress}%</span></div><div className="progress"><span style={{ width: `${progress}%` }} /></div></a>;
            })}
          </div>
        </section>

        <section className="feed-layout premium-community-feed">
          <div className="section-heading"><div><p className="eyebrow">Comunidade VIP</p><h2>Atividades recentes</h2></div><a href="/aluno/comunidade">Abrir comunidade</a></div>
          <HomeCommunityFeed initialPosts={feedPosts} />
        </section>
      </main>
    </AppShell>
  );
}
