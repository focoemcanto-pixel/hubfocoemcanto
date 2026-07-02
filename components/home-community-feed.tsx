'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, CheckCircle2, Heart, Lock, MessageCircle, MoreHorizontal, Send, Sparkles, Trash2, Volume2, VolumeX, X } from 'lucide-react';

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
  isLiked?: boolean;
  isSaved?: boolean;
  isFollowing?: boolean;
  isVipAuthor?: boolean;
};

type Comment = { id: string; text: string; createdAt?: string | null; authorName: string; authorAvatarUrl?: string | null; pending?: boolean };
type Props = { initialPosts: FeedPost[]; hasVipAccess?: boolean; vipCheckoutUrl?: string; currentProfileId?: string | null };

type CommentSheetProps = {
  post: FeedPost | null;
  comments: Comment[];
  loading: boolean;
  text: string;
  sending: boolean;
  onClose: () => void;
  onTextChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

const DEFAULT_VIP_CHECKOUT = 'https://pay.kiwify.com.br/HHr4eyM';
const css = `
.home-insta-feed.instagram-mobile-feed{display:grid;gap:28px}.home-insta-post.instagram-post-card{position:relative;border:1px solid rgba(255,255,255,.10);border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.28)}.home-post-head.instagram-post-head{display:flex;align-items:center;gap:12px;padding:14px}.instagram-author-avatar{width:44px;height:44px;border-radius:999px;display:grid;place-items:center;overflow:hidden;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05;font-weight:950}.instagram-author-avatar img{width:100%;height:100%;object-fit:cover}.instagram-author-copy{min-width:0;flex:1;display:grid;gap:2px}.instagram-author-copy-row{display:flex;align-items:center;gap:10px;min-width:0}.instagram-author-copy strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.instagram-author-copy span{color:rgba(255,255,255,.56);font-size:13px}.community-follow-button{border:0;background:transparent;color:#f5c76b;font-weight:950;font-size:13px;padding:0 2px;cursor:pointer}.community-follow-button.following{color:rgba(255,255,255,.62)}.home-post-options{position:relative}.home-post-menu{border:0;background:transparent;color:#fff;cursor:pointer}.post-options-popover.instagram-options-sheet{position:absolute;right:0;top:calc(100% + 8px);z-index:20;display:grid;gap:6px;width:240px;border:1px solid rgba(245,199,107,.25);border-radius:18px;background:rgba(10,10,14,.98);box-shadow:0 20px 80px rgba(0,0,0,.66);padding:9px}.post-options-popover a,.post-options-popover button{border:0;background:transparent;color:#fff;text-align:left;text-decoration:none;padding:10px;border-radius:12px;font:inherit;cursor:pointer}.post-options-popover a:hover,.post-options-popover button:hover{background:rgba(255,255,255,.08)}.danger-option{color:#ff7676!important}.home-post-media.instagram-reel-media{position:relative;aspect-ratio:9/14;background:#070707!important;overflow:hidden}.community-feed-video{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important;background:#070707!important}.home-post-media.text-post-media{aspect-ratio:auto;min-height:auto;background:transparent;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);padding:18px}.community-text-card{border:1px solid rgba(245,199,107,.18);border-radius:28px;background:linear-gradient(145deg,rgba(245,199,107,.13),rgba(255,255,255,.035),rgba(0,0,0,.32));padding:24px 22px}.community-text-type{display:inline-flex;border:1px solid rgba(245,199,107,.34);border-radius:999px;background:rgba(245,199,107,.10);color:#f5c76b;padding:8px 11px;text-transform:uppercase;font-size:11px;font-weight:1000;margin-bottom:16px}.community-text-main{margin:0;white-space:pre-line;color:#fff;line-height:1.35;font-weight:800;font-size:clamp(20px,4vw,36px)}.home-sound-toggle.instagram-sound-toggle{position:absolute;right:14px;bottom:14px;z-index:8;width:44px;height:44px;border:0;border-radius:999px;background:rgba(0,0,0,.58);color:#fff;display:grid;place-items:center;backdrop-filter:blur(10px)}.instagram-music-chip{position:absolute;left:14px;bottom:14px;max-width:calc(100% - 74px);border-radius:999px;background:rgba(0,0,0,.58);color:#fff;padding:9px 12px;font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.home-icon-actions.instagram-action-row{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 4px}.instagram-action-left{display:flex;align-items:center;gap:12px}.home-icon-actions button{border:0;background:transparent;color:#fff;padding:0;display:grid;place-items:center;cursor:pointer}.home-icon-actions button.liked,.home-icon-actions button.active-action{color:#ff477e}.reaction-pop svg{animation:reactionPop .22s ease-out}.instagram-engagement-line{padding:0 14px 6px;color:#fff}.instagram-bottom-caption{padding:0 14px 6px;margin:0;color:rgba(255,255,255,.84);line-height:1.35}.instagram-view-comments{margin:0 14px 14px;border:0;background:transparent;color:rgba(255,255,255,.58);display:inline-flex;gap:7px;align-items:center;font:inherit;cursor:pointer}.vip-verified-badge{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:999px;margin-left:5px;color:#130d05;background:linear-gradient(180deg,#ffe39b,#e9b348);vertical-align:-3px}.community-comment-sheet-backdrop{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.58);backdrop-filter:blur(5px);display:grid;align-items:end;overscroll-behavior:contain;touch-action:none}.community-comment-sheet{width:min(720px,100%);max-height:min(82dvh,720px);margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:30px 30px 0 0;background:linear-gradient(180deg,rgba(19,19,25,.985),rgba(8,8,12,.985));box-shadow:0 -24px 90px rgba(0,0,0,.65);padding:18px 18px calc(18px + env(safe-area-inset-bottom));display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:14px;transform:translateY(0);animation:commentSheetUp .24s ease-out both;touch-action:auto}.community-comment-sheet:before{content:'';width:42px;height:5px;border-radius:999px;background:rgba(255,255,255,.22);justify-self:center;margin:-4px 0 2px}.comment-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.comment-sheet-head h3{margin:0;font-size:clamp(26px,6vw,42px);letter-spacing:-.04em}.comment-sheet-close{border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:999px;width:52px;height:52px;display:grid;place-items:center}.comment-list{display:grid;align-content:start;gap:12px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-right:4px;min-height:180px}.comment-row{display:grid;grid-template-columns:38px 1fr;gap:10px}.comment-avatar{width:38px;height:38px;border-radius:999px;display:grid;place-items:center;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05;font-weight:950;overflow:hidden}.comment-avatar img{width:100%;height:100%;object-fit:cover}.comment-bubble{border:1px solid rgba(255,255,255,.10);border-radius:18px;background:rgba(255,255,255,.055);padding:10px 12px}.comment-bubble strong{display:block;font-size:14px}.comment-bubble p{margin:4px 0 0;color:rgba(255,255,255,.84);line-height:1.35}.comment-row.pending{opacity:.7}.comment-form{display:grid;grid-template-columns:1fr auto;gap:10px}.comment-form input{height:50px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.07);color:#fff;padding:0 16px;font:inherit;outline:0}.comment-form button{height:50px;border:0;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05;font-weight:950;padding:0 18px}.comment-empty{color:rgba(255,255,255,.66);text-align:center;padding:30px 12px;font-size:18px;align-self:center}.instagram-toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:2147483647;border:1px solid rgba(245,199,107,.28);border-radius:999px;background:rgba(14,14,18,.95);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:8px;box-shadow:0 18px 60px rgba(0,0,0,.55)}.vip-lock-backdrop{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.68);display:grid;place-items:center;padding:18px}.vip-lock-modal{position:relative;max-width:420px;border:1px solid rgba(245,199,107,.28);border-radius:28px;background:linear-gradient(180deg,#17171d,#09090c);padding:28px;color:#fff}.vip-lock-close{position:absolute;right:12px;top:12px;border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:999px;width:38px;height:38px}.vip-lock-icon{width:62px;height:62px;border-radius:18px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05;display:grid;place-items:center}.vip-lock-cta{display:block;margin-top:18px;border-radius:16px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#130d05;text-align:center;text-decoration:none;font-weight:950;padding:14px}.empty-community-feed,.community-empty-filter{border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(255,255,255,.04);padding:24px;text-align:center}@keyframes commentSheetUp{from{transform:translateY(100%);opacity:.9}to{transform:translateY(0);opacity:1}}@keyframes reactionPop{0%{transform:scale(.82)}70%{transform:scale(1.16)}100%{transform:scale(1)}}@media(max-width:640px){.community-comment-sheet{max-height:76dvh}.comment-form{grid-template-columns:1fr}.comment-form button{width:100%}.home-insta-post.instagram-post-card{border-radius:22px}.home-post-media.instagram-reel-media{aspect-ratio:9/15}}
`;

function initials(name?: string | null) { return String(name || 'Aluno').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function timeAgo(value?: string | null) { if (!value) return 'agora'; const diff = Math.max(0, Date.now() - new Date(value).getTime()); const minutes = Math.floor(diff / 60000); if (minutes < 1) return 'agora'; if (minutes < 60) return `${minutes}min`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h`; return `${Math.floor(hours / 24)}d`; }
function textKind(text?: string | null) { const value = String(text || '').toLowerCase(); if (value.includes('?') || value.includes('dúvida') || value.includes('duvida')) return '❓ Dúvida'; if (value.includes('consegui') || value.includes('vitória') || value.includes('vitoria') || value.includes('evolu')) return '🏆 Conquista'; return '📝 Texto'; }
function VerifiedBadge() { return <span className="vip-verified-badge" title="Assinante VIP"><CheckCircle2 aria-hidden size={13} /></span>; }

function CommentSheet({ post, comments, loading, text, sending, onClose, onTextChange, onSubmit }: CommentSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!post) return;
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => { document.body.style.overflow = originalOverflow; document.body.style.touchAction = originalTouchAction; };
  }, [post]);
  if (!mounted || !post) return null;
  return createPortal(
    <div className="community-comment-sheet-backdrop" onClick={onClose} role="presentation">
      <section className="community-comment-sheet" role="dialog" aria-modal="true" aria-label="Comentários" style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined} onClick={(event) => event.stopPropagation()} onTouchStart={(event) => setDragStart(event.touches[0]?.clientY ?? null)} onTouchMove={(event) => { if (dragStart == null) return; setDragY(Math.max(0, event.touches[0].clientY - dragStart)); }} onTouchEnd={() => { if (dragY > 110) onClose(); setDragStart(null); setDragY(0); }}>
        <div className="comment-sheet-head"><h3>Comentários</h3><button className="comment-sheet-close" type="button" onClick={onClose} aria-label="Fechar comentários"><X size={28} /></button></div>
        <div className="comment-list">{loading ? <p className="comment-empty">Carregando comentários...</p> : comments.length ? comments.map((comment) => <div className={`comment-row ${comment.pending ? 'pending' : ''}`} key={comment.id}><div className="comment-avatar">{comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt="" /> : initials(comment.authorName)}</div><div className="comment-bubble"><strong>{comment.authorName}{comment.pending ? ' · enviando' : ''}</strong><p>{comment.text}</p></div></div>) : <p className="comment-empty">Ainda não há comentários. Seja o primeiro.</p>}</div>
        <form className="comment-form" onSubmit={onSubmit}><input value={text} onChange={(event) => onTextChange(event.target.value)} placeholder="Escreva um comentário..." disabled={sending} /><button type="submit" disabled={sending || !text.trim()}>{sending ? 'Enviando...' : 'Enviar'}</button></form>
      </section>
    </div>,
    document.body,
  );
}

export function HomeCommunityFeed({ initialPosts, hasVipAccess = false, vipCheckoutUrl = DEFAULT_VIP_CHECKOUT, currentProfileId = null }: Props) {
  const [sessionProfileId, setSessionProfileId] = useState<string | null>(currentProfileId);
  const effectiveProfileId = currentProfileId || sessionProfileId;
  const normalizedPosts = useMemo(() => initialPosts.map((post) => ({ ...post, canDelete: Boolean(post.canDelete || (effectiveProfileId && post.authorId === effectiveProfileId)) })), [initialPosts, effectiveProfileId]);
  const [posts, setPosts] = useState(normalizedPosts);
  const [liked, setLiked] = useState<Record<string, boolean>>(() => Object.fromEntries(normalizedPosts.map((p) => [p.id, !!p.isLiked])));
  const [saved, setSaved] = useState<Record<string, boolean>>(() => Object.fromEntries(normalizedPosts.map((p) => [p.id, !!p.isSaved])));
  const [following, setFollowing] = useState<Record<string, boolean>>(() => Object.fromEntries(normalizedPosts.map((p) => [String(p.authorId || ''), !!p.isFollowing]).filter(([id]) => id)));
  const [soundPostId, setSoundPostId] = useState<string | null>(null);
  const soundPostRef = useRef<string | null>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const [menu, setMenu] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [vipModal, setVipModal] = useState(false);
  const [commentPost, setCommentPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentCache, setCommentCache] = useState<Record<string, Comment[]>>({});
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSending, setCommentSending] = useState(false);

  useEffect(() => setPosts(normalizedPosts), [normalizedPosts]);
  useEffect(() => { soundPostRef.current = soundPostId; videoRefs.current.forEach((video, id) => { video.muted = soundPostId !== id; }); }, [soundPostId]);
  useEffect(() => {
    if (currentProfileId) return;
    fetch('/api/community/session', { headers: { accept: 'application/json' } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.profile?.id) return;
        setSessionProfileId(String(data.profile.id));
        const nextFollowing: Record<string, boolean> = {};
        (data.followingIds || []).forEach((id: string) => { nextFollowing[String(id)] = true; });
        setFollowing((value) => ({ ...value, ...nextFollowing }));
      })
      .catch(() => null);
  }, [currentProfileId]);
  useEffect(() => {
    const videos = Array.from(videoRefs.current.entries());
    if (!videos.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target as HTMLVideoElement;
        const id = video.dataset.postId || '';
        if (entry.isIntersecting && entry.intersectionRatio >= 0.62) {
          videoRefs.current.forEach((other, otherId) => { if (otherId !== id) other.pause(); });
          video.muted = soundPostRef.current !== id;
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      });
    }, { threshold: [0, 0.35, 0.62, 0.9] });
    videos.forEach(([, video]) => observer.observe(video));
    return () => observer.disconnect();
  }, [posts.length]);

  function notice(text: string) { setToast(text); window.setTimeout(() => setToast(''), 1800); }
  function closeComments() { setCommentPost(null); setCommentText(''); setCommentsLoading(false); setCommentSending(false); }
  async function postForm(url: string, data: Record<string, string>) { const form = new FormData(); Object.entries(data).forEach(([k, v]) => form.set(k, v)); return fetch(url, { method: 'POST', body: form, headers: { accept: 'application/json' } }); }
  async function likePost(id: string) {
    const previous = liked[id];
    const next = !previous;
    setLiked((v) => ({ ...v, [id]: next }));
    setPosts((list) => list.map((p) => p.id === id ? { ...p, likesCount: Math.max(0, p.likesCount + (next ? 1 : -1)) } : p));
    const r = await postForm('/api/community/likes', { post_id: id, liked: String(next) });
    const data = await r.json().catch(() => null);
    if (!r.ok || data?.error) {
      setLiked((v) => ({ ...v, [id]: previous }));
      setPosts((list) => list.map((p) => p.id === id ? { ...p, likesCount: Math.max(0, p.likesCount + (next ? -1 : 1)) } : p));
      notice(data?.detail || 'Não foi possível curtir.');
    }
  }
  async function savePost(id: string) { const previous = saved[id]; const next = !previous; setSaved((v) => ({ ...v, [id]: next })); const r = await postForm('/api/community/saves', { post_id: id, saved: String(next) }); if (!r.ok) { setSaved((v) => ({ ...v, [id]: previous })); notice('Não foi possível salvar.'); } }
  async function followAuthor(authorId?: string | null) { if (!authorId || authorId === effectiveProfileId) return; const next = !following[authorId]; setFollowing((value) => ({ ...value, [authorId]: next })); const r = await postForm('/api/community/follows', { following_id: authorId, following: String(next) }); const data = await r.json().catch(() => null); if (!r.ok || data?.error) { setFollowing((value) => ({ ...value, [authorId]: !next })); notice(data?.detail || 'Não foi possível seguir.'); } }
  async function openComments(post: FeedPost) {
    setCommentPost(post); setCommentText('');
    const cached = commentCache[post.id];
    if (cached) { setComments(cached); return; }
    setComments([]); setCommentsLoading(true);
    const response = await fetch(`/api/community/comments?post_id=${encodeURIComponent(post.id)}`, { headers: { accept: 'application/json' } });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.comments) { setComments(data.comments); setCommentCache((cache) => ({ ...cache, [post.id]: data.comments })); }
    else notice('Não foi possível carregar comentários.');
    setCommentsLoading(false);
  }
  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!commentPost || !commentText.trim() || commentSending) return;
    const postId = commentPost.id;
    const text = commentText.trim();
    const tempId = `temp-${Date.now()}`;
    const tempComment: Comment = { id: tempId, text, authorName: 'Você', authorAvatarUrl: null, createdAt: new Date().toISOString(), pending: true };
    setCommentSending(true); setCommentText('');
    setComments((list) => [...list, tempComment]);
    setCommentCache((cache) => ({ ...cache, [postId]: [...(cache[postId] || []), tempComment] }));
    setPosts((list) => list.map((p) => p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p));
    setCommentPost((post) => post ? { ...post, commentsCount: post.commentsCount + 1 } : post);
    const r = await postForm('/api/community/comments', { post_id: postId, comment: text });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) {
      setComments((list) => list.filter((comment) => comment.id !== tempId));
      setCommentCache((cache) => ({ ...cache, [postId]: (cache[postId] || []).filter((comment) => comment.id !== tempId) }));
      setPosts((list) => list.map((p) => p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p));
      setCommentPost((post) => post ? { ...post, commentsCount: Math.max(0, post.commentsCount - 1) } : post);
      setCommentText(text); notice(data?.detail || 'Não foi possível comentar.'); setCommentSending(false); return;
    }
    const savedComment = data.comment as Comment;
    const replace = (list: Comment[]) => list.map((comment) => comment.id === tempId ? savedComment : comment);
    setComments(replace);
    setCommentCache((cache) => ({ ...cache, [postId]: replace(cache[postId] || []) }));
    setPosts((list) => list.map((p) => p.id === postId ? { ...p, commentsCount: data.comments_count ?? p.commentsCount } : p));
    setCommentPost((post) => post ? { ...post, commentsCount: data.comments_count ?? post.commentsCount } : post);
    setCommentSending(false);
  }
  async function deletePost(id: string) { const target = posts.find((post) => post.id === id); if (!target?.canDelete) { notice('Você só pode excluir suas próprias publicações.'); return; } if (!window.confirm('Excluir esta publicação?')) return; const previous = posts; setMenu(null); setPosts((list) => list.filter((p) => p.id !== id)); const response = await fetch(`/api/community/posts/${id}`, { method: 'DELETE', headers: { accept: 'application/json' } }); const data = await response.json().catch(() => null); if (!response.ok || !data?.ok) { setPosts(previous); notice(data?.detail || data?.error || 'Não foi possível excluir.'); return; } notice('Publicação excluída.'); }
  function sharePost(id: string) { const url = `${window.location.origin}/aluno/comunidade#post-${id}`; navigator.clipboard?.writeText(url).then(() => notice('Link copiado.')).catch(() => notice('Copie o link pela barra do navegador.')); }
  function toggleSound(id: string) { const next = soundPostId === id ? null : id; setSoundPostId(next); videoRefs.current.forEach((video, videoId) => { video.muted = next !== videoId; if (videoId !== id) video.pause(); }); const video = videoRefs.current.get(id); if (video) { video.muted = next !== id; video.play().catch(() => undefined); } }
  if (!posts.length) return <div className="empty-community-feed"><h3>Nenhuma postagem real ainda.</h3><p>Quando os alunos publicarem exercícios na comunidade, eles aparecerão aqui automaticamente.</p><Link className="premium-button gold" href="/aluno/comunidade">Criar primeira postagem</Link></div>;

  return <><style dangerouslySetInnerHTML={{ __html: css }} /><div className="home-insta-feed instagram-mobile-feed">{posts.map((post, index) => { const isTextOnly = !post.mediaUrl; const caption = post.caption || 'Compartilhou uma prática.'; const canFollow = Boolean(post.authorId && post.authorId !== effectiveProfileId); const soundOn = soundPostId === post.id; return <article className={`home-insta-post instagram-post-card ${isTextOnly ? 'text-only-post-card' : ''}`} id={`post-${post.id}`} key={post.id}><header className="home-post-head instagram-post-head"><div className="instagram-author-avatar">{post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt={post.authorName} loading="lazy" /> : <span>{initials(post.authorName)}</span>}</div><div className="instagram-author-copy"><div className="instagram-author-copy-row"><strong>{post.authorName}{post.isVipAuthor ? <VerifiedBadge /> : null}</strong>{canFollow ? <button className={`community-follow-button ${following[String(post.authorId)] ? 'following' : ''}`} type="button" onClick={() => followAuthor(post.authorId)}>{following[String(post.authorId)] ? 'Seguindo' : 'Seguir'}</button> : null}</div><span>{timeAgo(post.createdAt)}{post.isVipAuthor ? ' · VIP' : ''}</span></div><div className="home-post-options"><button className="home-post-menu" type="button" onClick={() => setMenu(menu === post.id ? null : post.id)}><MoreHorizontal size={28} /></button>{menu === post.id ? <div className="post-options-popover instagram-options-sheet"><Link href={`/aluno/comunidade#post-${post.id}`}>Ver publicação</Link>{post.exerciseSlug ? hasVipAccess ? <Link href={`/aluno/aula/${post.exerciseSlug}`}>Ver aula vinculada</Link> : <button type="button" onClick={() => setVipModal(true)}>Ver aula vinculada</button> : null}<button type="button" onClick={() => sharePost(post.id)}>Compartilhar/copiar link</button>{post.canDelete ? <button className="danger-option" type="button" onClick={() => deletePost(post.id)}><Trash2 size={18} /> Excluir publicação</button> : null}</div> : null}</div></header><div className={`home-post-media instagram-reel-media ${isTextOnly ? 'text-post-media' : ''}`}>{post.mediaUrl ? <><video ref={(element) => { if (element) videoRefs.current.set(post.id, element); else videoRefs.current.delete(post.id); }} data-post-id={post.id} className="community-feed-video" src={post.mediaUrl} muted={!soundOn} loop playsInline preload={index < 2 ? 'auto' : 'metadata'} controls={false} /> <button className="home-sound-toggle instagram-sound-toggle" type="button" onClick={() => toggleSound(post.id)}>{soundOn ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>{post.exerciseTitle ? <div className="instagram-music-chip">♪ {post.exerciseTitle}</div> : null}</> : <div className="community-text-card"><span className="community-text-type">{textKind(caption)}</span><p className="community-text-main">{caption}</p></div>}</div><div className="home-icon-actions instagram-action-row"><div className="instagram-action-left"><button type="button" className={liked[post.id] ? 'liked reaction-pop' : ''} onClick={() => likePost(post.id)}><Heart size={30} fill={liked[post.id] ? 'currentColor' : 'none'} /></button><button type="button" onClick={() => openComments(post)}><MessageCircle size={30} /></button><button type="button" onClick={() => sharePost(post.id)}><Send size={30} /></button></div><button type="button" className={`save-button ${saved[post.id] ? 'active-action reaction-pop' : ''}`} onClick={() => savePost(post.id)}><Bookmark size={31} fill={saved[post.id] ? 'currentColor' : 'none'} /></button></div><div className="instagram-engagement-line"><strong>{post.likesCount}</strong> curtidas</div>{isTextOnly ? null : <p className="home-post-caption instagram-bottom-caption"><strong>{post.authorName}{post.isVipAuthor ? <VerifiedBadge /> : null}</strong> {caption}</p>}<button type="button" className="instagram-view-comments" onClick={() => openComments(post)}><MessageCircle size={18} /> {post.commentsCount} comentários</button></article>; })}</div><CommentSheet post={commentPost} comments={comments} loading={commentsLoading} text={commentText} sending={commentSending} onClose={closeComments} onTextChange={setCommentText} onSubmit={submitComment} />{toast ? <div className="instagram-toast"><CheckCircle2 size={17} /> {toast}</div> : null}{vipModal ? <div className="vip-lock-backdrop" onClick={() => setVipModal(false)}><section className="vip-lock-modal" onClick={(e) => e.stopPropagation()}><button className="vip-lock-close" type="button" onClick={() => setVipModal(false)}><X size={22} /></button><div className="vip-lock-icon"><Lock size={30} /></div><p className="eyebrow"><Sparkles size={14} /> Exclusivo VIP</p><h3>Essa aula é para assinantes da Sala de Atividades VIP</h3><p>Assine para acessar exercícios, duetos e avaliações.</p><a className="vip-lock-cta" href={vipCheckoutUrl}>Assinar e desbloquear agora</a></section></div> : null}</>;
}
