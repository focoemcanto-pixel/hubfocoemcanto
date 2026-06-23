import { cookies } from 'next/headers';
import Link from 'next/link';
import { Bell, BookOpen, FileText, Headphones, Home, Plus, Send, User, Users, Video } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { HomeCommunityFeed } from '@/components/home-community-feed';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

type Related = { title?: string; name?: string; slug?: string; file_url?: string; avatar_url?: string } | null;
function related(value: unknown): Related { if (Array.isArray(value)) return (value[0] || null) as Related; return (value || null) as Related; }
function initials(name?: string | null) { const value = String(name || 'Aluno').trim(); return value.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function firstNameOf(name?: string | null) { return String(name || 'Marcos').trim().split(' ')[0] || 'Marcos'; }
function Avatar({ name, url, className = '' }: { name?: string | null; url?: string | null; className?: string }) { return <span className={className}>{url ? <img src={url} alt={name || 'Perfil'} /> : <span>{initials(name)}</span>}</span>; }
function hasVipSubscription(rows: any[]) { return rows.some((sub) => sub.course_key === 'grupo-vip' && isAccessActive(sub.status)); }

export const dynamic = 'force-dynamic';
const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || '/aluno?assinar=vip';
const createPostCss = `.new-post-menu summary{list-style:none;cursor:pointer}.new-post-menu summary::-webkit-details-marker{display:none}.new-post-menu[open]::before{content:'';position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.68);backdrop-filter:blur(12px)}.new-post-menu[open] .new-post-options{position:fixed;z-index:75;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,470px);display:grid;gap:14px;border:1px solid rgba(245,199,107,.22);border-radius:30px;background:linear-gradient(145deg,#17171f,#09090f);box-shadow:0 32px 120px rgba(0,0,0,.62);padding:18px}.new-post-options:before{content:'Criar publicação';display:block;color:#fff;font-size:26px;font-weight:1000;letter-spacing:-.04em;margin:2px 2px 4px}.new-post-options a{display:grid;grid-template-columns:48px 1fr;gap:6px 14px;align-items:center;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(255,255,255,.045);padding:18px;color:#fff;text-decoration:none}.new-post-options a svg{grid-row:span 2;color:#f5c76b}.new-post-options a strong{font-size:21px}.new-post-options a small{color:rgba(255,255,255,.62);line-height:1.35}`;

export default async function CommunityPage() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  const supabase = createAdminClient();
  const [{ data: posts }, { data: communitySubmissions }, { data: profile }] = await Promise.all([
    supabase.from('community_posts').select('id,profile_id,exercise_id,caption,media_url,likes_count,comments_count,created_at,profiles(name,avatar_url),exercises(title,slug),submissions(file_url)').order('created_at', { ascending: false }).limit(30),
    supabase.from('submissions').select('profile_id,exercise_id,file_url,created_at').eq('visibility', 'community').order('created_at', { ascending: false }).limit(100),
    email ? supabase.from('profiles').select('id,name,email,avatar_url').eq('email', email).maybeSingle() : { data: null },
  ]);
  const firstName = firstNameOf(profile?.name);
  const currentAvatarUrl = (profile as any)?.avatar_url || null;
  const postIds = (posts || []).map((post: any) => post.id).filter(Boolean);
  const authorIds = Array.from(new Set((posts || []).map((post: any) => post.profile_id).filter(Boolean)));
  const [{ data: follows }, { data: likes }, { data: saves }, { data: subscriptions }] = profile?.id ? await Promise.all([
    authorIds.length ? supabase.from('community_follows').select('following_id').eq('follower_id', profile.id).in('following_id', authorIds) : { data: [] },
    postIds.length ? supabase.from('community_likes').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : { data: [] },
    postIds.length ? supabase.from('community_saves').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : { data: [] },
    supabase.from('subscriptions').select('course_key,status').eq('profile_id', profile.id),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const hasVipAccess = hasVipSubscription(subscriptions || []);
  const followingIds = new Set((follows || []).map((follow: any) => follow.following_id));
  const likedPostIds = new Set((likes || []).map((like: any) => like.post_id));
  const savedPostIds = new Set((saves || []).map((save: any) => save.post_id));
  const fallbackSubmissionByKey = new Map<string, string>();
  (communitySubmissions || []).forEach((submission: any) => { const key = `${submission.profile_id}:${submission.exercise_id}`; if (!fallbackSubmissionByKey.has(key) && submission.file_url) fallbackSubmissionByKey.set(key, submission.file_url); });
  const feedPosts = (posts || []).map((post: any) => { const exercise = related(post.exercises); const author = related(post.profiles); const submission = related(post.submissions); const fallbackMedia = fallbackSubmissionByKey.get(`${post.profile_id}:${post.exercise_id}`) || ''; return { id: post.id, authorId: post.profile_id, authorName: author?.name || 'Aluno VIP', authorAvatarUrl: author?.avatar_url || null, createdAt: post.created_at, exerciseTitle: exercise?.title || (post.exercise_id ? 'Atividade da comunidade' : null), exerciseSlug: exercise?.slug || null, caption: post.caption || 'Compartilhou uma prática.', mediaUrl: post.media_url || submission?.file_url || fallbackMedia || null, likesCount: post.likes_count || 0, commentsCount: post.comments_count || 0, canDelete: Boolean(profile?.id && profile.id === post.profile_id), isFollowing: followingIds.has(post.profile_id), isLiked: likedPostIds.has(post.id), isSaved: savedPostIds.has(post.id) }; });

  return (
    <AppShell>
      <main className="community-instagram-page">
        <style dangerouslySetInnerHTML={{ __html: createPostCss }} />
        <aside className="community-side-nav">
          <Link className="community-brand" href="/aluno" prefetch><Headphones size={30} /><span>FOCO<small>EM CANTO</small></span></Link>
          <nav><Link href="/aluno" prefetch><Home size={28} /><span>Início</span></Link><Link href="/aluno/biblioteca" prefetch><BookOpen size={28} /><span>Biblioteca</span></Link><Link className="active" href="/aluno/comunidade" prefetch><Users size={28} /><span>Comunidade</span></Link><Link href="/aluno/perfil" prefetch><User size={28} /><span>Perfil</span></Link></nav>
          <Link className="community-support" href="/aluno/perfil" prefetch><Headphones size={20} /> Suporte</Link>
        </aside>
        <section className="community-main-feed">
          <header className="community-feed-topbar"><div><p className="eyebrow">Comunidade VIP</p><h1>Compartilhe sua evolução.</h1><p>Publique sua prática, receba apoio dos alunos e acompanhe o crescimento do grupo.</p></div><div className="community-top-actions"><Link className="community-bell" href="/aluno/notificacoes" aria-label="Notificações"><Bell size={20} /></Link><Link className="community-current-avatar-link" href="/aluno/perfil" aria-label="Perfil"><Avatar className="community-current-avatar" name={firstName} url={currentAvatarUrl} /></Link></div></header>
          <section className="community-create-strip"><div className="community-tabs"><a className="active" href="#feed-comunidade">Para você</a><a href="#feed-comunidade">Recentes</a><a href="#feed-comunidade">Seguindo</a></div><details className="new-post-menu"><summary><Plus size={30} /><span>Nova publicação</span></summary><div className="new-post-options"><a href="#nova-publicacao"><FileText size={22} /><strong>Texto</strong><small>Compartilhe uma ideia, dúvida ou conquista.</small></a><Link href="/aluno/biblioteca"><Video size={22} /><strong>Dueto/atividade</strong><small>Escolha o módulo, grave e publique pelo envio.</small></Link></div></details></section>
          <section id="nova-publicacao" className="community-composer-instagram text-only-composer"><div className="composer-topline"><div className="avatar-ring mini"><Avatar name={firstName} url={currentAvatarUrl} /></div><strong>{firstName}</strong><small>Publicação de texto</small></div><form action="/api/community/posts" method="post"><textarea name="caption" placeholder="O que você treinou hoje? Compartilhe uma prática, dúvida, testemunho ou conquista..." /><div className="composer-actions-instagram"><span>Para publicar vídeo de dueto, escolha uma aula na biblioteca e envie a atividade.</span><button type="submit"><Send size={18} /> Publicar texto</button></div></form></section>
          <section id="feed-comunidade" className="community-social-feed"><HomeCommunityFeed initialPosts={feedPosts} hasVipAccess={hasVipAccess} vipCheckoutUrl={VIP_CHECKOUT_URL} /></section>
        </section>
      </main>
    </AppShell>
  );
}
