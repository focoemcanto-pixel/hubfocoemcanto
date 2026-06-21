import { cookies } from 'next/headers';
import { Bell, Bookmark, Heart, Home, MessageCircle, MoreVertical, Plus, Send, Users, BookOpen, User, Headphones } from 'lucide-react';
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

function formatTime(value?: string | null) {
  if (!value) return 'agora';
  const created = new Date(value).getTime();
  if (!Number.isFinite(created)) return 'agora';
  const diff = Math.max(0, Date.now() - created);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const demoPosts = [
  {
    id: 'demo-1',
    author: 'Juliana Mendes',
    title: 'A Casa é Sua',
    caption: 'Treinando minha segunda voz com a aula A Casa é Sua 🎵 cada dia evoluindo mais!\n#FocoEmCanto',
    media_url: '',
    likes_count: 128,
    comments_count: 24,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    comments: [
      { id: 'c1', name: 'Marcos Lima', comment: 'Mandou muito! Sua afinação na segunda voz está incrível! 👏' },
      { id: 'c2', name: 'Ana Beatriz', comment: 'Que evolução! Parabéns! 🔥' },
    ],
  },
  {
    id: 'demo-2',
    author: 'Rafael Souza',
    title: 'Duetos para Treino',
    caption: 'Gravei meu primeiro dueto! Feedbacks são bem-vindos! 🎙️🔥',
    media_url: '',
    likes_count: 74,
    comments_count: 11,
    created_at: new Date(Date.now() - 14400000).toISOString(),
    comments: [],
  },
];

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
  const firstName = firstNameOf(profile?.name);
  const feed = posts && posts.length > 0 ? posts : demoPosts;

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
            <div className="community-top-actions">
              <button type="button" aria-label="Notificações"><Bell size={20} /></button>
              <span>{initials(firstName)}</span>
            </div>
          </header>

          <section className="community-create-strip">
            <div className="community-tabs">
              <a className="active" href="/aluno/comunidade">Para você</a>
              <a href="/aluno/comunidade">Recentes</a>
              <a href="/aluno/comunidade">Seguindo</a>
            </div>
            <a className="new-post-button" href="#nova-publicacao"><Plus size={30} /><span>Nova publicação</span></a>
          </section>

          <section id="nova-publicacao" className="community-composer-instagram">
            <div className="composer-topline">
              <div className="avatar-ring mini"><span>{initials(firstName)}</span></div>
              <strong>{firstName}</strong>
              <small>Aluno VIP</small>
            </div>
            <form action="/api/community/posts" method="post">
              <textarea name="caption" placeholder="O que você treinou hoje? Compartilhe sua prática, dificuldade ou conquista..." />
              <select name="exercise_id" defaultValue="">
                <option value="">Vincular somente a aula publicada no Hub</option>
                {exercises.map((item: any) => <option value={item.id} key={item.id}>{item.moduleTitle} — {item.title}</option>)}
              </select>
              <div className="composer-actions-instagram">
                <span>Publique práticas gravadas pelo envio da atividade.</span>
                <button type="submit"><Send size={18} /> Publicar</button>
              </div>
            </form>
          </section>

          <section className="community-social-feed">
            {feed.map((post: any, index: number) => {
              const exercise = related(post.exercises);
              const author = related(post.profiles);
              const authorName = author?.name || post.author || 'Aluno VIP';
              const title = exercise?.title || post.title || 'Prática vocal';
              const comments = post.community_comments ? (post.community_comments || []).slice(0, 3) : post.comments || [];
              return (
                <article className="instagram-post-card" key={post.id || index}>
                  <header className="instagram-post-header">
                    <div className="avatar-ring"><span>{initials(authorName)}</span></div>
                    <div className="post-author-copy"><strong>{authorName}</strong><span>{formatTime(post.created_at)} · <b>VIP</b></span></div>
                    <button type="button" aria-label="Mais opções"><MoreVertical size={22} /></button>
                  </header>

                  {post.caption ? <p className="instagram-caption">{post.caption}</p> : null}

                  <div className="instagram-media-frame">
                    {post.media_url ? (
                      <video src={post.media_url} controls playsInline />
                    ) : (
                      <div className="demo-duet-art">
                        <div className="demo-duet-left"><span>♪</span><strong>{title}</strong><small>Casa Worship</small></div>
                        <div className="demo-duet-right"><span>Dueto</span></div>
                      </div>
                    )}
                    <button type="button" className="media-play">▶</button>
                    <div className="media-track-pill"><span>♫</span><strong>{title}</strong><small>{post.track || 'Dueto'}</small></div>
                    <span className="media-type-pill">Dueto</span>
                  </div>

                  <div className="instagram-actions">
                    <form action="/api/community/likes" method="post">
                      <input type="hidden" name="post_id" value={post.id} />
                      <input type="hidden" name="return_to" value="/aluno/comunidade" />
                      <button type="submit"><Heart size={25} fill={index === 0 ? '#ef4444' : 'none'} /> <span>{post.likes_count || 0}</span></button>
                    </form>
                    <button type="button"><MessageCircle size={25} /> <span>{post.comments_count || 0}</span></button>
                    <button type="button"><Send size={24} /></button>
                    <button type="button" className="save"><Bookmark size={25} /></button>
                  </div>

                  <p className="liked-by"><span>👩🏽‍🎤</span><span>🎙️</span><span>🎧</span> Curtido por Marcos, Ana e outras {Math.max(0, (post.likes_count || 0) - 2)} pessoas</p>
                  <button className="view-comments" type="button">Ver todos os {post.comments_count || comments.length || 0} comentários</button>

                  <div className="instagram-comments">
                    {comments.map((comment: any) => {
                      const commentAuthor = related(comment.profiles);
                      const name = commentAuthor?.name || comment.name || 'Aluno';
                      return <p key={comment.id}><strong>{name}</strong> {comment.comment}<Heart size={15} /></p>;
                    })}
                  </div>

                  <form className="instagram-comment-form" action="/api/community/comments" method="post">
                    <input type="hidden" name="post_id" value={post.id} />
                    <input type="hidden" name="return_to" value="/aluno/comunidade" />
                    <span>{initials(firstName)}</span>
                    <input name="comment" placeholder="Deixe um comentário..." />
                    <button type="submit"><Send size={18} /></button>
                  </form>
                </article>
              );
            })}
          </section>
        </section>
      </main>
    </AppShell>
  );
}
