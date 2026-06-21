'use client';

import { useRef, useState } from 'react';

type FeedPost = {
  id: string;
  authorId?: string | null;
  authorName: string;
  authorAvatarUrl?: string | null;
  createdAt?: string | null;
  exerciseTitle?: string | null;
  exerciseSlug?: string | null;
  caption?: string | null;
  mediaUrl?: string | null;
  likesCount: number;
  commentsCount: number;
  canDelete?: boolean;
  isFollowing?: boolean;
};

function initials(name?: string | null) {
  return String(name || 'Aluno')
    .trim()
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function timeAgo(value?: string | null) {
  if (!value) return 'agora';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function HomeCommunityFeed({ initialPosts }: { initialPosts: FeedPost[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string[]>>({});
  const [soundOn, setSoundOn] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [reposted, setReposted] = useState<Record<string, boolean>>({});
  const [following, setFollowing] = useState<Record<string, boolean>>(() => Object.fromEntries(initialPosts.map((post) => [post.authorId || post.id, Boolean(post.isFollowing)])));
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [removingPost, setRemovingPost] = useState<string | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  async function likePost(postId: string) {
    const willLike = !liked[postId];
    setLiked((current) => ({ ...current, [postId]: willLike }));
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, likesCount: Math.max(0, post.likesCount + (willLike ? 1 : -1)) } : post));

    const form = new FormData();
    form.set('post_id', postId);
    form.set('return_to', '/aluno');

    const response = await fetch('/api/community/likes', { method: 'POST', body: form, headers: { accept: 'application/json' } });
    if (response.ok) {
      const json = await response.json().catch(() => null);
      if (json) {
        setLiked((current) => ({ ...current, [postId]: Boolean(json.liked) }));
        setPosts((current) => current.map((post) => post.id === postId ? { ...post, likesCount: Number(json.likes_count || 0) } : post));
      }
    }
  }

  async function commentPost(postId: string, formElement: HTMLFormElement) {
    const input = formElement.elements.namedItem('comment') as HTMLInputElement | null;
    const value = input?.value.trim() || '';
    if (!value) return;

    input!.value = '';
    setComments((current) => ({ ...current, [postId]: [...(current[postId] || []), value] }));
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, commentsCount: post.commentsCount + 1 } : post));

    const form = new FormData();
    form.set('post_id', postId);
    form.set('return_to', '/aluno');
    form.set('comment', value);

    const response = await fetch('/api/community/comments', { method: 'POST', body: form, headers: { accept: 'application/json' } });
    if (response.ok) {
      const json = await response.json().catch(() => null);
      if (json) setPosts((current) => current.map((post) => post.id === postId ? { ...post, commentsCount: Number(json.comments_count || post.commentsCount) } : post));
    }
  }

  async function followAuthor(authorId?: string | null) {
    if (!authorId) return;
    const next = !following[authorId];
    setFollowing((current) => ({ ...current, [authorId]: next }));
    const form = new FormData();
    form.set('following_id', authorId);
    const response = await fetch('/api/community/follows', { method: 'POST', body: form, headers: { accept: 'application/json' } });
    if (response.ok) {
      const json = await response.json().catch(() => null);
      if (json) setFollowing((current) => ({ ...current, [authorId]: Boolean(json.following) }));
    }
  }

  async function removePost(postId: string) {
    if (!window.confirm('Excluir esta publicação?')) return;
    setRemovingPost(postId);
    const previous = posts;
    setPosts((current) => current.filter((post) => post.id !== postId));
    setOpenMenu(null);
    const response = await fetch(`/api/community/posts/${postId}`, { method: 'DELETE', headers: { accept: 'application/json' } });
    if (!response.ok) {
      setPosts(previous);
      alert('Não foi possível excluir a publicação.');
    }
    setRemovingPost(null);
  }

  function toggleVideo(postId: string) {
    const video = videoRefs.current[postId];
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  }

  function toggleSound(postId: string) {
    const video = videoRefs.current[postId];
    const enabled = !soundOn[postId];
    setSoundOn((current) => ({ ...current, [postId]: enabled }));
    if (video) {
      video.muted = !enabled;
      video.volume = enabled ? 1 : 0;
      video.play().catch(() => undefined);
    }
  }

  function sharePost(postId: string) {
    const url = `${window.location.origin}/aluno/comunidade#post-${postId}`;
    if (navigator.share) navigator.share({ title: 'Publicação Foco em Canto', url }).catch(() => undefined);
    else navigator.clipboard?.writeText(url);
  }

  if (!posts.length) {
    return (
      <div className="empty-community-feed">
        <h3>Nenhuma postagem real ainda.</h3>
        <p>Quando os alunos publicarem exercícios na comunidade, eles aparecerão aqui automaticamente.</p>
        <a className="premium-button gold" href="/aluno/comunidade">Criar primeira postagem</a>
      </div>
    );
  }

  return (
    <div className="home-insta-feed instagram-mobile-feed">
      {posts.map((post) => {
        const localComments = comments[post.id] || [];
        const followsAuthor = following[post.authorId || post.id];
        return (
          <article className="home-insta-post instagram-post-card" id={`post-${post.id}`} key={post.id}>
            <header className="home-post-head instagram-post-head">
              <div className="instagram-author-avatar">
                {post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt={post.authorName || 'Aluno'} /> : <span>{initials(post.authorName)}</span>}
              </div>
              <div className="instagram-author-copy">
                <strong>{post.authorName || 'Aluno VIP'}</strong>
                <span>{timeAgo(post.createdAt)} · Aluno VIP</span>
              </div>
              {!post.canDelete ? <button className={`instagram-follow-button ${followsAuthor ? 'following' : ''}`} type="button" onClick={() => followAuthor(post.authorId)}>{followsAuthor ? 'Seguindo' : 'Seguir'}</button> : null}
              <div className="home-post-options">
                <button className="home-post-menu" type="button" onClick={() => setOpenMenu(openMenu === post.id ? null : post.id)}>•••</button>
                {openMenu === post.id ? (
                  <div className="post-options-popover instagram-options-sheet">
                    <a href={`/aluno/comunidade#post-${post.id}`}>Ver publicação</a>
                    {post.exerciseSlug ? <a href={`/aluno/aula/${post.exerciseSlug}`}>Ver aula vinculada</a> : null}
                    {post.exerciseSlug ? <a href={`/aluno/atividade/${post.exerciseSlug}`}>Gravar dueto</a> : null}
                    <button type="button" onClick={() => sharePost(post.id)}>Compartilhar</button>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/aluno/comunidade#post-${post.id}`)}>Copiar link</button>
                    {post.canDelete ? <button className="danger-option" type="button" disabled={removingPost === post.id} onClick={() => removePost(post.id)}>{removingPost === post.id ? 'Excluindo...' : 'Excluir publicação'}</button> : null}
                  </div>
                ) : null}
              </div>
            </header>

            {post.caption ? <p className="instagram-top-caption">{post.caption}</p> : null}

            <div className="home-post-media instagram-reel-media" onClick={() => toggleVideo(post.id)}>
              {post.mediaUrl ? (
                <>
                  <video ref={(node) => { videoRefs.current[post.id] = node; }} src={post.mediaUrl} autoPlay muted={!soundOn[post.id]} loop playsInline preload="auto" controls={false} />
                  <div className="instagram-play-hint">▶</div>
                  <button className="home-sound-toggle instagram-sound-toggle" type="button" onClick={(event) => { event.stopPropagation(); toggleSound(post.id); }}>{soundOn[post.id] ? '🔊' : '🔇'}</button>
                  <div className="instagram-exercise-chip">
                    <span>♫</span>
                    <div><strong>{post.exerciseTitle || 'Atividade'}</strong><small>Dueto</small></div>
                  </div>
                  <span className="instagram-duet-badge">Dueto</span>
                </>
              ) : (
                <div className="home-post-placeholder"><div><span>▶</span><strong>{post.exerciseTitle || 'Publicação da comunidade'}</strong><small>Vídeo ainda não vinculado a este post</small></div></div>
              )}
            </div>

            <div className="home-icon-actions instagram-action-row">
              <button type="button" className={liked[post.id] ? 'liked' : ''} onClick={() => likePost(post.id)} aria-label="Curtir">{liked[post.id] ? '♥' : '♡'}</button>
              <a href={`/aluno/comunidade#post-${post.id}`} aria-label="Comentar">◯</a>
              <button type="button" className={reposted[post.id] ? 'active-action' : ''} onClick={() => setReposted((current) => ({ ...current, [post.id]: !current[post.id] }))} aria-label="Repostar">↻</button>
              <button type="button" onClick={() => sharePost(post.id)} aria-label="Enviar">⌲</button>
              <button type="button" className={`save-button ${saved[post.id] ? 'active-action' : ''}`} onClick={() => setSaved((current) => ({ ...current, [post.id]: !current[post.id] }))} aria-label="Salvar">{saved[post.id] ? '▰' : '▱'}</button>
            </div>

            <div className="instagram-engagement-line">
              <span className="mini-reaction-stack">🎤🎧🎶</span>
              <strong>{post.likesCount}</strong> curtidas · <strong>{post.commentsCount}</strong> comentários
            </div>

            <p className="home-post-caption instagram-bottom-caption"><strong>{post.authorName || 'Aluno VIP'}</strong>{post.caption || 'Compartilhou uma prática.'}</p>
            {post.exerciseSlug ? (
              <div className="home-lesson-actions instagram-lesson-actions">
                <a href={`/aluno/aula/${post.exerciseSlug}`}>Ver aula</a>
                <a className="primary" href={`/aluno/atividade/${post.exerciseSlug}`}>Gravar dueto</a>
              </div>
            ) : null}

            {localComments.length ? <div className="home-local-comments">{localComments.slice(-3).map((comment, index) => <p key={`${post.id}-${index}`}><strong>Você</strong> {comment}</p>)}</div> : null}
            <form className="home-comment-form instagram-comment-form" onSubmit={(event) => { event.preventDefault(); commentPost(post.id, event.currentTarget); }}>
              <input name="comment" placeholder="Adicionar comentário..." />
              <button type="submit">Publicar</button>
            </form>
          </article>
        );
      })}
    </div>
  );
}
