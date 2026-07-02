'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bookmark, CheckCircle2, Heart, Lock, MessageCircle, MoreHorizontal, Repeat2, Send, Sparkles, Trash2, Volume2, VolumeX, X } from 'lucide-react';

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
  isVipAuthor?: boolean;
};

type Props = { initialPosts: FeedPost[]; hasVipAccess?: boolean; vipCheckoutUrl?: string };

const DEFAULT_VIP_CHECKOUT = 'https://pay.kiwify.com.br/HHr4eyM';
const css = `.home-post-media.instagram-reel-media{background:#070707!important;overflow:hidden}.community-feed-video{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important;background:#070707!important}.home-post-media.text-post-media{aspect-ratio:auto;min-height:auto;background:transparent;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);padding:18px}.community-text-card{border:1px solid rgba(245,199,107,.18);border-radius:28px;background:linear-gradient(145deg,rgba(245,199,107,.13),rgba(255,255,255,.035),rgba(0,0,0,.32));padding:24px 22px}.community-text-type{display:inline-flex;border:1px solid rgba(245,199,107,.34);border-radius:999px;background:rgba(245,199,107,.10);color:#f5c76b;padding:8px 11px;text-transform:uppercase;font-size:11px;font-weight:1000;margin-bottom:16px}.community-text-main{margin:0;white-space:pre-line;color:#fff;line-height:1.35;font-weight:800;font-size:clamp(20px,4vw,36px)}.vip-verified-badge{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:999px;margin-left:5px;color:#130d05;background:linear-gradient(180deg,#ffe39b,#e9b348);vertical-align:-3px}.home-sound-toggle.instagram-sound-toggle{z-index:8}.danger-option{color:#ff7676!important}`;

function initials(name?: string | null) {
  return String(name || 'Aluno').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
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
function textKind(text?: string | null) {
  const value = String(text || '').toLowerCase();
  if (value.includes('?') || value.includes('dúvida') || value.includes('duvida')) return '❓ Dúvida';
  if (value.includes('consegui') || value.includes('vitória') || value.includes('vitoria') || value.includes('evolu')) return '🏆 Conquista';
  return '📝 Texto';
}
function VerifiedBadge() {
  return <span className="vip-verified-badge" title="Assinante VIP"><CheckCircle2 aria-hidden size={13} /></span>;
}

export function HomeCommunityFeed({ initialPosts, hasVipAccess = false, vipCheckoutUrl = DEFAULT_VIP_CHECKOUT }: Props) {
  const [posts, setPosts] = useState(initialPosts);
  const [liked, setLiked] = useState<Record<string, boolean>>(() => Object.fromEntries(initialPosts.map((p) => [p.id, !!p.isLiked])));
  const [saved, setSaved] = useState<Record<string, boolean>>(() => Object.fromEntries(initialPosts.map((p) => [p.id, !!p.isSaved])));
  const [soundOn, setSoundOn] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [vipModal, setVipModal] = useState(false);

  function notice(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(''), 1800);
  }

  async function postForm(url: string, data: Record<string, string>) {
    const form = new FormData();
    Object.entries(data).forEach(([k, v]) => form.set(k, v));
    return fetch(url, { method: 'POST', body: form, headers: { accept: 'application/json' } });
  }

  async function likePost(id: string) {
    const next = !liked[id];
    setLiked((v) => ({ ...v, [id]: next }));
    setPosts((list) => list.map((p) => p.id === id ? { ...p, likesCount: Math.max(0, p.likesCount + (next ? 1 : -1)) } : p));
    const r = await postForm('/api/community/likes', { post_id: id, liked: String(next) });
    if (!r.ok) notice('Não foi possível curtir.');
  }

  async function savePost(id: string) {
    const next = !saved[id];
    setSaved((v) => ({ ...v, [id]: next }));
    notice(next ? 'Salvo nos favoritos.' : 'Removido dos favoritos.');
    const r = await postForm('/api/community/saves', { post_id: id, saved: String(next) });
    if (!r.ok) notice('Não foi possível salvar.');
  }

  async function deletePost(id: string) {
    if (!window.confirm('Excluir esta publicação?')) return;
    const previous = posts;
    setMenu(null);
    setPosts((list) => list.filter((p) => p.id !== id));
    const response = await fetch(`/api/community/posts/${id}`, { method: 'DELETE', headers: { accept: 'application/json' } });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      setPosts(previous);
      notice(data?.detail || 'Não foi possível excluir.');
      return;
    }
    notice('Publicação excluída.');
  }

  function sharePost(id: string) {
    const url = `${window.location.origin}/aluno/comunidade#post-${id}`;
    navigator.clipboard?.writeText(url).then(() => notice('Link copiado.')).catch(() => notice('Copie o link pela barra do navegador.'));
  }

  function toggleSound(id: string) {
    setSoundOn((v) => ({ ...v, [id]: !v[id] }));
  }

  if (!posts.length) return <div className="empty-community-feed"><h3>Nenhuma postagem real ainda.</h3><p>Quando os alunos publicarem exercícios na comunidade, eles aparecerão aqui automaticamente.</p><Link className="premium-button gold" href="/aluno/comunidade">Criar primeira postagem</Link></div>;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="home-insta-feed instagram-mobile-feed">
        {posts.map((post, index) => {
          const isTextOnly = !post.mediaUrl;
          const caption = post.caption || 'Compartilhou uma prática.';
          return (
            <article className={`home-insta-post instagram-post-card ${isTextOnly ? 'text-only-post-card' : ''}`} id={`post-${post.id}`} key={post.id}>
              <header className="home-post-head instagram-post-head">
                <div className="instagram-author-avatar">{post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt={post.authorName} loading="lazy" /> : <span>{initials(post.authorName)}</span>}</div>
                <div className="instagram-author-copy"><strong>{post.authorName}{post.isVipAuthor ? <VerifiedBadge /> : null}</strong><span>{timeAgo(post.createdAt)}{post.isVipAuthor ? ' · VIP' : ''}</span></div>
                <div className="home-post-options"><button className="home-post-menu" type="button" onClick={() => setMenu(menu === post.id ? null : post.id)}><MoreHorizontal size={28} /></button>{menu === post.id ? <div className="post-options-popover instagram-options-sheet"><Link href={`/aluno/comunidade#post-${post.id}`}>Ver publicação</Link>{post.exerciseSlug ? hasVipAccess ? <Link href={`/aluno/aula/${post.exerciseSlug}`}>Ver aula vinculada</Link> : <button type="button" onClick={() => setVipModal(true)}>Ver aula vinculada</button> : null}<button type="button" onClick={() => sharePost(post.id)}>Compartilhar/copiar link</button><button className="danger-option" type="button" onClick={() => deletePost(post.id)}><Trash2 size={18} /> Excluir publicação</button></div> : null}</div>
              </header>
              <div className={`home-post-media instagram-reel-media ${isTextOnly ? 'text-post-media' : ''}`}>{post.mediaUrl ? <><video data-post-id={post.id} className="community-feed-video" src={post.mediaUrl} muted={!soundOn[post.id]} loop playsInline controls preload={index < 2 ? 'auto' : 'metadata'} /> <button className="home-sound-toggle instagram-sound-toggle" type="button" onClick={() => toggleSound(post.id)}>{soundOn[post.id] ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>{post.exerciseTitle ? <div className="instagram-music-chip">♪ {post.exerciseTitle}</div> : null}</> : <div className="community-text-card"><span className="community-text-type">{textKind(caption)}</span><p className="community-text-main">{caption}</p></div>}</div>
              <div className="home-icon-actions instagram-action-row"><div className="instagram-action-left"><button type="button" className={liked[post.id] ? 'liked reaction-pop' : ''} onClick={() => likePost(post.id)}><Heart size={30} fill={liked[post.id] ? 'currentColor' : 'none'} /></button><button type="button" onClick={() => sharePost(post.id)}><Send size={30} /></button></div><button type="button" className={`save-button ${saved[post.id] ? 'active-action reaction-pop' : ''}`} onClick={() => savePost(post.id)}><Bookmark size={31} fill={saved[post.id] ? 'currentColor' : 'none'} /></button></div>
              <div className="instagram-engagement-line"><strong>{post.likesCount}</strong> curtidas</div>
              {isTextOnly ? null : <p className="home-post-caption instagram-bottom-caption"><strong>{post.authorName}{post.isVipAuthor ? <VerifiedBadge /> : null}</strong> {caption}</p>}
              <button type="button" className="instagram-view-comments"><MessageCircle size={18} /> {post.commentsCount} comentários</button>
            </article>
          );
        })}
      </div>
      {toast ? <div className="instagram-toast"><CheckCircle2 size={17} /> {toast}</div> : null}
      {vipModal ? <div className="vip-lock-backdrop" onClick={() => setVipModal(false)}><section className="vip-lock-modal" onClick={(e) => e.stopPropagation()}><button className="vip-lock-close" type="button" onClick={() => setVipModal(false)}><X size={22} /></button><div className="vip-lock-icon"><Lock size={30} /></div><p className="eyebrow"><Sparkles size={14} /> Exclusivo VIP</p><h3>Essa aula é para assinantes da Sala de Atividades VIP</h3><p>Assine para acessar exercícios, duetos e avaliações.</p><a className="vip-lock-cta" href={vipCheckoutUrl}>Assinar e desbloquear agora</a></section></div> : null}
    </>
  );
}
