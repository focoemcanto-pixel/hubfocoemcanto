import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';

export default async function CommunityPage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from('community_posts')
    .select('id,caption,media_url,likes_count,comments_count,created_at,profiles(name),exercises(title)')
    .order('created_at', { ascending: false })
    .limit(30);

  return (
    <AppShell>
      <main className="page">
        <p className="eyebrow">Comunidade VIP</p>
        <h1 className="hero-title">Prática em movimento</h1>
        <p className="muted">Veja atividades publicadas pelos alunos e acompanhe a evolução do grupo.</p>
        <section className="grid" style={{ marginTop: 20 }}>
          {(posts || []).map((post) => (
            <article className="card" key={post.id}>
              <p className="eyebrow">Atividade publicada</p>
              <h2>{post.exercises?.title || 'Exercício'}</h2>
              <p className="muted">{post.caption}</p>
              {post.media_url ? <a className="button secondary" href={post.media_url}>Assistir</a> : null}
              <p className="muted">{post.likes_count} curtidas • {post.comments_count} comentários</p>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
