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

export const dynamic = 'force-dynamic';

export default async function CommunityPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();

  const [{ data: posts }, { data: exercises }, { data: profile }] = await Promise.all([
    supabase.from('community_posts').select('id,caption,media_url,likes_count,comments_count,created_at,profiles(name),exercises(title),community_comments(id,comment,profiles(name))').order('created_at', { ascending: false }).limit(30),
    supabase.from('exercises').select('id,title').eq('is_active', true).order('sort_order').limit(80),
    email ? supabase.from('profiles').select('name,email').eq('email', email).maybeSingle() : { data: null },
  ]);

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
            <div className="composer-grid">
              <select name="exercise_id" defaultValue="">
                <option value="">Vincular a uma aula opcional</option>
                {(exercises || []).map((item: any) => <option value={item.id} key={item.id}>{item.title}</option>)}
              </select>
              <input name="media_url" placeholder="URL do vídeo ou áudio opcional" />
            </div>
            <div className="composer-actions">
              <span>Publicar no feed da comunidade</span>
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
                  {post.media_url ? <video className="community-media" src={post.media_url} controls playsInline /> : <div className="community-wave"><span>Play</span><i /><i /><i /><i /><i /><i /><small>prática vocal</small></div>}
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
