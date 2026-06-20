import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const demoFeed = [
  {
    name: 'Ana Beatriz',
    track: 'Duetos para Treino',
    title: 'Tu Es Fiel Senhor',
    caption: 'Enviei minha segunda voz para avaliacao. Foi meu melhor treino da semana.',
    rating: '5.0',
    comments: 8,
    likes: 32,
  },
  {
    name: 'Carlos Henrique',
    track: 'Firmar Afinacao',
    title: 'Exercicio de Afinacao 01',
    caption: 'Treino para manter a nota firme ate o final.',
    rating: '4.0',
    comments: 4,
    likes: 18,
  },
];

function getRelated(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function StudentPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();

  const [{ data: modules }, { data: profile }, { data: posts }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,icon,sort_order').order('sort_order'),
    email ? supabase.from('profiles').select('name,email').eq('email', email).maybeSingle() : { data: null },
    supabase
      .from('community_posts')
      .select('id,caption,media_url,likes_count,comments_count,created_at,profiles(name),exercises(title)')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const feedItems = posts && posts.length > 0 ? posts : demoFeed;

  return (
    <AppShell>
      <main className="page app-home">
        <section className="student-hero">
          <div>
            <p className="eyebrow">Grupo VIP Foco em Harmonia</p>
            <h1>Ola{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}. Bora treinar hoje?</h1>
            <p className="muted">Sua central de pratica, comunidade e avaliacao vocal.</p>
            <div className="hero-actions">
              <a className="button" href="/aluno/trilhas">Continuar treino</a>
              <a className="button secondary" href="/aluno/enviar">Enviar atividade</a>
            </div>
          </div>
          <div className="daily-card">
            <span>Treino recomendado</span>
            <strong>Dueto da semana</strong>
            <p>Escolha um material, grave sua parte e envie para avaliacao.</p>
            <a href="/aluno/trilhas/duetos-para-treino">Comecar agora</a>
          </div>
        </section>

        <section className="quick-stats">
          <article><strong>7</strong><span>dias de foco</span></article>
          <article><strong>12</strong><span>atividades avaliadas</span></article>
          <article><strong>4.8</strong><span>media vocal</span></article>
        </section>

        <section className="study-rail">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Areas de estudo</p>
              <h2>Trilhas para evoluir por objetivo</h2>
            </div>
            <a href="/aluno/trilhas">Ver todas</a>
          </div>
          <div className="module-row">
            {(modules || []).map((module) => (
              <a className="module-tile" key={module.id} href={`/aluno/trilhas/${module.slug}`}>
                <span>Trilha</span>
                <strong>{module.title}</strong>
                <p>{module.description}</p>
                <div className="progress"><span style={{ width: '18%' }} /></div>
              </a>
            ))}
          </div>
        </section>

        <section className="feed-layout">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Comunidade VIP</p>
              <h2>Atividades recentes</h2>
            </div>
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
                    <div>
                      <strong>{author?.name || post.name}</strong>
                      <span>{exercise?.title || post.title} - {post.track || 'Atividade'}</span>
                    </div>
                  </div>
                  <div className="media-placeholder">
                    <span>Play</span>
                    <p>{exercise?.title || post.title}</p>
                  </div>
                  <p>{post.caption}</p>
                  <div className="feed-meta">
                    <span>Nota {post.rating || '5.0'}</span>
                    <span>{post.likes_count || post.likes} curtidas</span>
                    <span>{post.comments_count || post.comments} comentarios</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
