'use client';

import { useRef, useState } from 'react';

type FeedPost = {
  id: string;
  authorName: string;
  exerciseTitle?: string | null;
  exerciseSlug?: string | null;
  caption?: string | null;
  mediaUrl?: string | null;
  likesCount: number;
  commentsCount: number;
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

export function HomeCommunityFeed({ initialPosts }: { initialPosts: FeedPost[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string[]>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  async function likePost(postId: string) {
    setLiked((current) => ({ ...current, [postId]: !current[postId] }));
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, likesCount: Math.max(0, post.likesCount + (liked[postId] ? -1 : 1)) } : post));

    const form = new FormData();
    form.set('post_id', postId);
    form.set('return_to', '/aluno');

    const response = await fetch('/api/community/likes', {
      method: 'POST',
      body: form,
      headers: { accept: 'application/json' },
    });

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

    const response = await fetch('/api/community/comments', {
      method: 'POST',
      body: form,
      headers: { accept: 'application/json' },
    });

    if (response.ok) {
      const json = await response.json().catch(() => null);
      if (json) {
        setPosts((current) => current.map((post) => post.id === postId ? { ...post, commentsCount: Number(json.comments_count || post.commentsCount) } : post));
      }
    }
  }

  function toggleVideo(postId: string) {
    const video = videoRefs.current[postId];
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
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
    <div className="home-insta-feed">
      {posts.map((post) => {
        const localComments = comments[post.id] || [];
        return (
          <article className="home-insta-post" key={post.id}>
            <header className="home-post-head">
              <div className="avatar">{initials(post.authorName)}</div>
              <div>
                <strong>{post.authorName || 'Aluno VIP'}</strong>
                <span>{post.exerciseTitle || 'Atividade da comunidade'}</span>
              </div>
              <a className="home-post-menu" href="/aluno/comunidade">•••</a>
            </header>

            <div className="home-post-media" onClick={() => toggleVideo(post.id)}>
              {post.mediaUrl ? (
                <video
                  ref={(node) => { videoRefs.current[post.id] = node; }}
                  src={post.mediaUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  controls={false}
                />
              ) : (
                <div className="home-post-placeholder">
                  <div><span>▶</span><strong>{post.exerciseTitle || 'Publicação da comunidade'}</strong></div>
                </div>
              )}
            </div>

            <div className="home-icon-actions">
              <button type="button" className={liked[post.id] ? 'liked' : ''} onClick={() => likePost(post.id)} aria-label="Curtir">{liked[post.id] ? '♥' : '♡'}</button>
              <a href={`/aluno/comunidade#post-${post.id}`} aria-label="Comentar">💬</a>
              <a href={`/aluno/comunidade#post-${post.id}`} aria-label="Compartilhar">↗</a>
            </div>

            <div className="home-lesson-actions">
              {post.exerciseSlug ? <a href={`/aluno/aula/${post.exerciseSlug}`}>Abrir aula</a> : null}
              {post.exerciseSlug ? <a className="primary" href={`/aluno/atividade/${post.exerciseSlug}`}>Realizar atividade</a> : null}
            </div>

            <p className="home-post-caption"><strong>{post.authorName || 'Aluno VIP'}</strong>{post.caption || 'Compartilhou uma prática.'}</p>
            <div className="home-post-meta"><span>{post.likesCount} curtidas</span><span>{post.commentsCount} comentários</span></div>

            {localComments.length ? (
              <div className="home-local-comments">
                {localComments.slice(-3).map((comment, index) => <p key={`${post.id}-${index}`}><strong>Você</strong> {comment}</p>)}
              </div>
            ) : null}

            <form className="home-comment-form" onSubmit={(event) => { event.preventDefault(); commentPost(post.id, event.currentTarget); }}>
              <input name="comment" placeholder="Adicionar comentário..." />
              <button type="submit">Publicar</button>
            </form>
          </article>
        );
      })}
    </div>
  );
}
