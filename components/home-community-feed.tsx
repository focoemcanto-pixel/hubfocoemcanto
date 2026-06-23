'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bookmark, CheckCircle2, Heart, MessageCircle, MoreHorizontal, Repeat2, Send, Trash2, Volume2, VolumeX, X } from 'lucide-react';

type FeedPost = { id: string; authorId?: string | null; authorName: string; authorAvatarUrl?: string | null; createdAt?: string | null; exerciseTitle?: string | null; exerciseSlug?: string | null; caption?: string | null; mediaUrl?: string | null; likesCount: number; commentsCount: number; canDelete?: boolean; isFollowing?: boolean; isLiked?: boolean; isSaved?: boolean; isReposted?: boolean };

function initials(name?: string | null) { return String(name || 'Aluno').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function timeAgo(value?: string | null) { if (!value) return 'agora'; const diff = Math.max(0, Date.now() - new Date(value).getTime()); const minutes = Math.floor(diff / 60000); if (minutes < 1) return 'agora'; if (minutes < 60) return `${minutes}min`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h`; return `${Math.floor(hours / 24)}d`; }

export function HomeCommunityFeed({ initialPosts }: { initialPosts: FeedPost[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [liked, setLiked] = useState<Record<string, boolean>>(() => Object.fromEntries(initialPosts.map((p) => [p.id, !!p.isLiked])));
  const [saved, setSaved] = useState<Record<string, boolean>>(() => Object.fromEntries(initialPosts.map((p) => [p.id, !!p.isSaved])));
  const [reposted, setReposted] = useState<Record<string, boolean>>(() => Object.fromEntries(initialPosts.map((p) => [p.id, !!p.isReposted])));
  const [following, setFollowing] = useState<Record<string, boolean>>(() => Object.fromEntries(initialPosts.map((p) => [p.authorId || p.id, !!p.isFollowing])));
  const [comments, setComments] = useState<Record<string, string[]>>({});
  const [soundOn, setSoundOn] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => { document.body.classList.toggle('comments-open', !!sheet); return () => document.body.classList.remove('comments-open'); }, [sheet]);
  useEffect(() => {
    const videos = Object.values(refs.current).filter(Boolean) as HTMLVideoElement[];
    videos.forEach((video) => { if (video.dataset.src && video.src !== video.dataset.src) video.src = video.dataset.src; video.load(); });
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
      const video = entry.target as HTMLVideoElement;
      if (entry.isIntersecting) video.play().catch(() => undefined);
      else video.pause();
    }), { rootMargin: '420px 0px', threshold: .35 });
    videos.forEach((video) => io.observe(video));
    return () => io.disconnect();
  }, [posts]);

  function notice(text: string) { setToast(text); window.setTimeout(() => setToast(''), 1700); }
  async function postForm(url: string, data: Record<string, string>) { const form = new FormData(); Object.entries(data).forEach(([k, v]) => form.set(k, v)); return fetch(url, { method: 'POST', body: form, headers: { accept: 'application/json' } }); }
  async function likePost(id: string) { const previousLiked = liked[id]; const previousPosts = posts; const next = !previousLiked; setLiked((v) => ({ ...v, [id]: next })); setPosts((list) => list.map((p) => p.id === id ? { ...p, likesCount: Math.max(0, p.likesCount + (next ? 1 : -1)) } : p)); const r = await postForm('/api/community/likes', { post_id: id, liked: String(next) }); const data = await r.json().catch(() => null); if (!r.ok || !data?.ok) { setLiked((v) => ({ ...v, [id]: !!previousLiked })); setPosts(previousPosts); notice(data?.detail || 'Não foi possível curtir.'); return; } if (typeof data.likes_count === 'number') setPosts((list) => list.map((p) => p.id === id ? { ...p, likesCount: data.likes_count } : p)); }
  async function savePost(id: string) { const previousSaved = saved[id]; const next = !previousSaved; setSaved((v) => ({ ...v, [id]: next })); notice(next ? 'Salvo nos favoritos.' : 'Removido dos favoritos.'); const r = await postForm('/api/community/saves', { post_id: id, saved: String(next) }); if (!r.ok) { setSaved((v) => ({ ...v, [id]: !!previousSaved })); notice('Não foi possível salvar.'); } }
  async function repeatPost(id: string) { const previousRepost = reposted[id]; const next = !previousRepost; setReposted((v) => ({ ...v, [id]: next })); notice(next ? 'Repostado no seu perfil.' : 'Repost removido.'); const r = await postForm('/api/community/reposts', { post_id: id, reposted: String(next) }); if (!r.ok) { setReposted((v) => ({ ...v, [id]: !!previousRepost })); notice('Execute o SQL de reposts para ativar.'); } }
  async function followAuthor(authorId?: string | null) {
    if (!authorId) return;
    const previousFollow = following[authorId];
    const next = !previousFollow;
    setFollowing((value) => ({ ...value, [authorId]: next }));
    const response = await postForm('/api/community/follows', { following_id: authorId, following: String(next) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      setFollowing((value) => ({ ...value, [authorId]: !!previousFollow }));
      notice(data?.detail || 'Não foi possível seguir. Execute o SQL de follows.');
      return;
    }
    if (data.self) {
      setFollowing((value) => ({ ...value, [authorId]: false }));
      notice('Esse é o seu próprio perfil.');
      return;
    }
    const persisted = Boolean(data.following);
    setFollowing((value) => ({ ...value, [authorId]: persisted }));
    setPosts((list) => list.map((post) => post.authorId === authorId ? { ...post, isFollowing: persisted } : post));
    notice(persisted ? 'Agora você está seguindo.' : 'Você deixou de seguir.');
  }
  async function addComment(id: string, formEl: HTMLFormElement) { const input = formEl.elements.namedItem('comment') as HTMLInputElement | null; const text = input?.value.trim() || ''; if (!text) return; const previousPosts = posts; input!.value = ''; setComments((v) => ({ ...v, [id]: [...(v[id] || []), text] })); setPosts((list) => list.map((p) => p.id === id ? { ...p, commentsCount: p.commentsCount + 1 } : p)); const r = await postForm('/api/community/comments', { post_id: id, comment: text }); if (!r.ok) { setPosts(previousPosts); notice('Comentário não enviado.'); } }
  async function deletePost(id: string) { if (!window.confirm('Excluir esta publicação?')) return; const previous = posts; setRemoving(id); setMenu(null); setPosts((list) => list.filter((p) => p.id !== id)); const response = await fetch(`/api/community/posts/${id}`, { method: 'DELETE', headers: { accept: 'application/json' } }); const data = await response.json().catch(() => null); if (!response.ok || !data?.ok) { setPosts(previous); notice(data?.detail || 'Não foi possível excluir.'); } else notice('Publicação excluída.'); setRemoving(null); }
  function sharePost(id: string) { const url = `${window.location.origin}/aluno/comunidade#post-${id}`; if (navigator.share) navigator.share({ title: 'Publicação Foco em Canto', url }).catch(() => undefined); else { navigator.clipboard?.writeText(url); notice('Link copiado.'); } }
  function toggleSound(id: string) { const video = refs.current[id]; const on = !soundOn[id]; setSoundOn((v) => ({ ...v, [id]: on })); if (video) { video.muted = !on; video.play().catch(() => undefined); } }

  if (!posts.length) return <div className="empty-community-feed"><h3>Nenhuma postagem real ainda.</h3><p>Quando os alunos publicarem exercícios na comunidade, eles aparecerão aqui automaticamente.</p><Link className="premium-button gold" href="/aluno/comunidade">Criar primeira postagem</Link></div>;
  const sheetPost = posts.find((p) => p.id === sheet) || null;

  return <>
    <div className="home-insta-feed instagram-mobile-feed">{posts.map((post) => <article className={`home-insta-post instagram-post-card ${removing === post.id ? 'post-removing' : ''}`} id={`post-${post.id}`} key={post.id}>
      {reposted[post.id] ? <div className="repost-ribbon"><Repeat2 size={14} /> Você repostou essa prática</div> : null}
      <header className="home-post-head instagram-post-head"><div className="instagram-author-avatar">{post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt={post.authorName} /> : <span>{initials(post.authorName)}</span>}</div><div className="instagram-author-copy"><strong>{post.authorName}</strong><span>{timeAgo(post.createdAt)}</span></div>{!post.canDelete ? <button className={`instagram-follow-button ${following[post.authorId || post.id] ? 'following' : ''}`} type="button" onClick={() => followAuthor(post.authorId)}>{following[post.authorId || post.id] ? 'Seguindo' : 'Seguir'}</button> : null}<div className="home-post-options"><button className="home-post-menu" type="button" onClick={() => setMenu(menu === post.id ? null : post.id)}><MoreHorizontal size={28} /></button>{menu === post.id ? <div className="post-options-popover instagram-options-sheet"><Link href={`/aluno/comunidade#post-${post.id}`}>Ver publicação</Link>{post.exerciseSlug ? <Link href={`/aluno/aula/${post.exerciseSlug}`}>Ver aula vinculada</Link> : null}<button type="button" onClick={() => repeatPost(post.id)}>{reposted[post.id] ? 'Remover repost' : 'Repostar'}</button><button type="button" onClick={() => sharePost(post.id)}>Compartilhar/copiar link</button>{post.canDelete ? <button className="danger-option" type="button" onClick={() => deletePost(post.id)}><Trash2 size={18} /> Excluir publicação</button> : null}</div> : null}</div></header>
      <div className="home-post-media instagram-reel-media">{post.mediaUrl ? <><video ref={(node) => { refs.current[post.id] = node; }} src={post.mediaUrl} data-src={post.mediaUrl} muted={!soundOn[post.id]} loop playsInline preload="metadata" onLoadedData={(event) => { if (!soundOn[post.id]) event.currentTarget.play().catch(() => undefined); }} /><button className="home-sound-toggle instagram-sound-toggle" type="button" onClick={() => toggleSound(post.id)}>{soundOn[post.id] ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>{post.exerciseTitle ? <div className="instagram-music-chip">♪ {post.exerciseTitle}</div> : null}</> : <div className="home-post-placeholder"><strong>{post.exerciseTitle || 'Publicação da comunidade'}</strong></div>}</div>
      <div className="home-icon-actions instagram-action-row"><div className="instagram-action-left"><button type="button" className={liked[post.id] ? 'liked reaction-pop' : ''} onClick={() => likePost(post.id)}><Heart size={30} fill={liked[post.id] ? 'currentColor' : 'none'} /></button><button type="button" onClick={() => setSheet(post.id)}><MessageCircle size={30} /></button><button type="button" onClick={() => sharePost(post.id)}><Send size={30} /></button><button type="button" className={reposted[post.id] ? 'active-action reaction-pop' : ''} onClick={() => repeatPost(post.id)}><Repeat2 size={29} /></button></div><button type="button" className={`save-button ${saved[post.id] ? 'active-action reaction-pop' : ''}`} onClick={() => savePost(post.id)}><Bookmark size={31} fill={saved[post.id] ? 'currentColor' : 'none'} /></button></div>
      <div className="instagram-engagement-line"><strong>{post.likesCount}</strong> curtidas</div><p className="home-post-caption instagram-bottom-caption"><strong>{post.authorName}</strong> {post.caption || 'Compartilhou uma prática.'}</p><button type="button" className="instagram-view-comments" onClick={() => setSheet(post.id)}>Ver todos os {post.commentsCount} comentários</button>{(comments[post.id] || []).slice(-2).map((c, i) => <p className="home-local-comments" key={i}><strong>Você</strong> {c}</p>)}
    </article>)}</div>
    {toast ? <div className="instagram-toast"><CheckCircle2 size={17} /> {toast}</div> : null}
    {sheetPost ? <div className="comments-sheet-backdrop" onClick={() => setSheet(null)}><section className="comments-sheet" onClick={(e) => e.stopPropagation()}><div className="comments-sheet-handle" /><header><h3>Comentários</h3><button type="button" onClick={() => setSheet(null)}><X size={28} /></button></header><div className="comments-sheet-list">{(comments[sheetPost.id] || []).length ? comments[sheetPost.id].map((c, i) => <p key={i}><strong>Você</strong> {c}</p>) : <p className="empty-comment-text">Seja o primeiro a comentar essa prática.</p>}</div><form className="comments-sheet-form" onSubmit={(e) => { e.preventDefault(); addComment(sheetPost.id, e.currentTarget); }}><input name="comment" placeholder="Adicionar comentário..." /><button type="submit">Publicar</button></form></section></div> : null}
  </>;
}
