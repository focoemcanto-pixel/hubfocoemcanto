import { cookies } from 'next/headers';
import { Bell, BookOpen, Headphones, Home, Plus, Send, User, Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { HomeCommunityFeed } from '@/components/home-community-feed';
import { createAdminClient } from '@/lib/supabase/admin';

type Related = { title?: string; name?: string; slug?: string; file_url?: string } | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

function initials(name?: string | null) {
  const value = String(name || 'Aluno').trim();
  return value.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function firstNameOf(name?: string | null) {
  return String(name || 'Marcos').trim().split(' ')[0] || 'Marcos';
}

function isRealModule(module: any) {
  const title = String(module?.title || '').toLowerCase();
  const description = String(module?.description || '').toLowerCase();
  if (!module?.is_active) return false;
  if (title === 'biblioteca geral') return false;
  if (description.includes('importados da pasta')) return false;
  return true;
}

export const dynamic = 'force-dynamic';

export default async function CommunityPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();

  const [{ data: posts }, { data: communitySubmissions }, { data: rawModules }, { data: profile }] = await Promise.all([
    supabase
      .from('community_posts')
      .select('id,profile_id,exercise_id,caption,media_url,likes_count,comments_count,created_at,profiles(name),exercises(title,slug),submissions(file_url)')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('submissions').select('profile_id,exercise_id,file_url,created_at').eq('visibility', 'community').order('created_at', { ascending: false }).limit(100),
    supabase.from('modules').select('id,title,description,is_active,sort_order,exercises(id,title,is_active,sort_order)').eq('is_active', true).order('sort_order'),
    email ? supabase.from('profiles').select('name,email').eq('email', email).maybeSingle() : { data: null },
  ]);

  const modules = (rawModules || []).filter(isRealModule);
  const exercises = modules.flatMap((module: any) => (module.exercises || [])
    .filter((exercise: any) => exercise.is_active)
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((exercise: any) => ({ ...exercise, moduleTitle: module.title }))
  );
  const firstName = firstNameOf(profile?.name);

  const fallbackSubmissionByKey = new Map<string, string>();
  (communitySubmissions || []).forEach((submission: any) => {
    const key = `${submission.profile_id}:${submission.exercise_id}`;
    if (!fallbackSubmissionByKey.has(key) && submission.file_url) fallbackSubmissionByKey.set(key, submission.file_url);
  });

  const feedPosts = (posts || []).map((post: any) => {
    const exercise = related(post.exercises);
    const author = related(post.profiles);
    const submission = related(post.submissions);
    const fallbackMedia = fallbackSubmissionByKey.get(`${post.profile_id}:${post.exercise_id}`) || '';
    return {
      id: post.id,
      authorName: author?.name || 'Aluno VIP',
      exerciseTitle: exercise?.title || 'Atividade da comunidade',
      exerciseSlug: exercise?.slug || null,
      caption: post.caption || 'Compartilhou uma prática.',
      mediaUrl: post.media_url || submission?.file_url || fallbackMedia || null,
      likesCount: post.likes_count || 0,
      commentsCount: post.comments_count || 0,
    };
  });

  return (
    <AppShell>
      <main className="community-instagram-page">
        <aside className="community-side-nav">
          <a className="community-brand" href="/aluno"><Headphones size={30} /><span>FOCO<small>EM CANTO</small></span></a>
          <nav>
            <a href="/aluno"><Home size={28} /><span>Início</span></a>
            <a href="/aluno/biblioteca"><BookOpen size={28} /><span>Biblioteca</span></a>
            <a className="active" href="/aluno/comunidade"><Users size={28} /><span>Comunidade</span></a>
            <a href="/aluno/perfil"><User size={28} /><span>Perfil</span></a>
          </nav>
          <a className="community-support" href="/aluno/perfil"><Headphones size={20} /> Suporte</a>
        </aside>

        <section className="community-main-feed">
          <header className="community-feed-topbar">
            <div>
              <p className="eyebrow">Comunidade VIP</p>
              <h1>Compartilhe sua evolução.</h1>
              <p>Publique sua prática, receba apoio dos alunos e acompanhe o crescimento do grupo.</p>
            </div>
            <div className="community-top-actions"><button type="button" aria-label="Notificações"><Bell size={20} /></button><span>{initials(firstName)}</span></div>
          </header>

          <section className="community-create-strip">
            <div className="community-tabs"><a className="active" href="/aluno/comunidade">Para você</a><a href="/aluno/comunidade">Recentes</a><a href="/aluno/comunidade">Seguindo</a></div>
            <a className="new-post-button" href="#nova-publicacao"><Plus size={30} /><span>Nova publicação</span></a>
          </section>

          <section id="nova-publicacao" className="community-composer-instagram">
            <div className="composer-topline"><div className="avatar-ring mini"><span>{initials(firstName)}</span></div><strong>{firstName}</strong><small>Aluno VIP</small></div>
            <form action="/api/community/posts" method="post">
              <textarea name="caption" placeholder="O que você treinou hoje? Compartilhe sua prática, dificuldade ou conquista..." />
              <select name="exercise_id" defaultValue="">
                <option value="">Vincular somente a aula publicada no Hub</option>
                {exercises.map((item: any) => <option value={item.id} key={item.id}>{item.moduleTitle} — {item.title}</option>)}
              </select>
              <div className="composer-actions-instagram"><span>Publique práticas gravadas pelo envio da atividade.</span><button type="submit"><Send size={18} /> Publicar</button></div>
            </form>
          </section>

          <section className="community-social-feed">
            <HomeCommunityFeed initialPosts={feedPosts} />
          </section>
        </section>
      </main>
    </AppShell>
  );
}
