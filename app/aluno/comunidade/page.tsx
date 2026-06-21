import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

type Related = { title?: string; name?: string } | null;

function related(value: unknown): Related {
  if (Array.isArray(value)) return (value[0] || null) as Related;
  return (value || null) as Related;
}

function initials(name?: string | null) {
  const value = String(name || 'Aluno').trim();
  return value.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
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

  const [{ data: posts }, { data: rawModules }, { data: profile }] = await Promise.all([
    supabase.from('community_posts').select('id,caption,media_url,likes_count,comments_count,created_at,profiles(name),exercises(title),community_comments(id,comment,profiles(name))').order('created_at', { ascending: false }).limit(30),
    supabase.from('modules').select('id,title,description,is_active,sort_order,exercises(id,title,is_active,sort_order)').eq('is_active', true).order('sort_order'),
    email ? supabase.from('profiles').select('name,email').eq('email', email).maybeSingle() : { data: null },
  ]);

  const modules = (rawModules || []).filter(isRealModule);
  const exercises = modules.flatMap((module: any) => (module.exercises || [])
    .filter((exercise: any) => exercise.is_active)
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((exercise: any) => ({ ...exercise, moduleTitle: module.title }))
  );
  const firstName = profile?.name ? profile.name.split(' ')[0] : 'Marcos';

  return (
    <AppShell>
      <main className="community-page-premium">
        <section className="community-hero-premium">
          <div>
            <p className="eyebrow">Comunidade VIP</p>
            <h1>Compartilhe sua evolução.</h1>
            <p>Publique sua prática, receba apoio dos alunos e acompanhe o crescimento do grupo.</p>
          </div>
          <div className="community-profile-badge"><span>{initials(firstName)}</span><strong>{firstName}</strong><small>Aluno VIP</small></div>
        </section>

        <section className="community-composer-card">
          <div className="composer-avatar">{initials(firstName)}</div>
          <form action="/api/community/posts" method="post">
            <textarea name="caption" placeholder="O que você treinou hoje? Compartilhe sua prática, dificuldade ou conquista..." />
            <div className="composer-grid secure-composer-grid">
              <select name="exercise_id" defaultValue="">
                <option value="">Vincular somente a aula publicada no Hub</option>
                {exercises.map((item: any) => <option value={item.id} key={item.id}>{item.moduleTitle} — {item.title}</option>)}
              </select>
            </div>
            <div className="composer-actions">
              <span>Conteúdo do Drive não pode ser anexado aqui. Publique sua prática pelo envio da atividade.</span>
              <button type="submit">Publicar</button>
            </div>
          </form>
        </section>

        <section className="community-feed-premium">
          <div className="section-heading"><div><p className="eyebrow">Feed</p><h2>Postagens recentes</h2></div></div>
          <div className="community-post-list">
            {(posts || []).map((post: any) => {
              const exercise = related(post.exercises);
              const author = related(post.profiles);
              const comments = (post.community_comments || []).slice(0, 3);
              return (
                <article className="community-post-card" key={post.id}>
                  <header className="community-post-head">
                    <div className="avatar premium-avatar-small">{initials(author?.name)}</div>
                    <div><strong>{author?.name || 'Aluno VIP'}</strong><span>{exercise?.title || 'Postagem livre'}</span></div>
                    <button type="button">...</button>
                  </header>
                  {post.caption ? <p className="community-caption">{post.caption}</p> : null}
                  {post.media_url ? <video className="community-media" src={post.media_url} controls playsInline /> : <div className="community-wave"><span>Post</span><i /><i /><i /><i /><i /><i /><small>prática vocal</small></div>}
                  <div className="community-actions-row">
                    <form action="/api/community/likes" method="post"><input type="hidden" name="post_id" value={post.id} /><input type="hidden" name="return_to" value="/aluno/comunidade" /><button type="submit">Curtir {post.likes_count || 0}</button></form>
                    <span>Comentários {post.comments_count || 0}</span>
                  </div>
                  <div className="community-comments-list">
                    {comments.map((comment: any) => {
                      const commentAuthor = related(comment.profiles);
                      return <p key={comment.id}><strong>{commentAuthor?.name || 'Aluno'}:</strong> {comment.comment}</p>;
                    })}
                  </div>
                  <form className="community-comment-form" action="/api/community/comments" method="post"><input type="hidden" name="post_id" value={post.id} /><input type="hidden" name="return_to" value="/aluno/comunidade" /><input name="comment" placeholder="Escreva um comentário de incentivo..." /><button type="submit">Comentar</button></form>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
