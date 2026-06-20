import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const demoFeed = [
  { name: 'Ana Beatriz', track: 'Duetos para Treino', title: 'Tu Es Fiel Senhor', caption: 'Enviei minha segunda voz para avaliacao.', rating: '5.0', comments: 8, likes: 32 },
  { name: 'Carlos Henrique', track: 'Firmar Afinacao', title: 'Exercicio de Afinacao 01', caption: 'Treino para manter a nota firme.', rating: '4.0', comments: 4, likes: 18 },
];

function getRelated(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function isRealModule(module: any) {
  const description = String(module.description || '').toLowerCase();
  return description.indexOf('importados da pasta') === -1;
}

export default async function StudentPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();

  const [{ data: rawModules }, { data: profile }, { data: posts }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,cover_url,icon,sort_order,exercises(id)').eq('is_active', true).order('sort_order'),
    email ? supabase.from('profiles').select('name,email').eq('email', email).maybeSingle() : { data: null },
    supabase.from('community_posts').select('id,caption,media_url,likes_count,comments_count,created_at,profiles(name),exercises(title)').order('created_at', { ascending: false }).limit(10),
  ]);

  const modules = (rawModules || []).filter(isRealModule);
  const feedItems = posts && posts.length > 0 ? posts : demoFeed;

  return (
    <AppShell>
      <main className="page app-home netflix-home">
        <section className="student-hero netflix-hero">
          <div>
            <p className="eyebrow">Grupo VIP Foco em Harmonia</p>
            <h1>Ola{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}. Escolha seu treino de hoje.</h1>
            <p className="muted">Biblioteca premium com aulas, audios e duetos organizados por objetivo.</p>
            <div className="hero-actions">
              <a className="button" href="/aluno/biblioteca">Abrir biblioteca</a>
              <a className="button secondary" href="/aluno/enviar">Enviar atividade</a>
            </div>
          </div>
        </section>

        <section className="netflix-rail">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Areas de estudo</p>
              <h2>Continue evoluindo</h2>
            </div>
            <a href="/aluno/biblioteca">Ver todas</a>
          </div>
          <div className="netflix-row">
            {modules.map((module: any) => (
              <a className="netflix-card" key={module.id} href={`/aluno/biblioteca/${module.slug}`}>
                {module.cover_url ? <img src={module.cover_url} alt="" /> : null}
                <div><span>Modulo</span><strong>{module.title}</strong><p>{module.exercises?.length || 0} aulas</p></div>
              </a>
            ))}
          </div>
        </section>

        <section className="feed-layout">
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
                  <div className="media-placeholder"><span>Play</span><p>{exercise?.title || post.title}</p></div>
                  <p>{post.caption}</p>
                  <div className="feed-meta"><span>Nota {post.rating || '5.0'}</span><span>{post.likes_count || post.likes} curtidas</span><span>{post.comments_count || post.comments} comentarios</span></div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
