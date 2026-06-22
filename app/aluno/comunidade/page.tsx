import { cookies } from 'next/headers';
import Link from 'next/link';
import { Bell, BookOpen, FileText, Headphones, Home, Plus, Send, User, Users, Video } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { HomeCommunityFeed } from '@/components/home-community-feed';
import { createAdminClient } from '@/lib/supabase/admin';

type Related = { title?: string; name?: string; slug?: string; file_url?: string; avatar_url?: string } | null;
function related(value: unknown): Related { if (Array.isArray(value)) return (value[0] || null) as Related; return (value || null) as Related; }
function initials(name?: string | null) { const value = String(name || 'Aluno').trim(); return value.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function firstNameOf(name?: string | null) { return String(name || 'Marcos').trim().split(' ')[0] || 'Marcos'; }
function Avatar({ name, url, className = '' }: { name?: string | null; url?: string | null; className?: string }) { return <span className={className}>{url ? <img src={url} alt={name || 'Perfil'} /> : <span>{initials(name)}</span>}</span>; }

export const dynamic = 'force-dynamic';

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
  const [{ data: follows }, { data: likes }, { data: saves }] = profile?.id ? await Promise.all([
    authorIds.length ? supabase.from('community_follows').select('following_id').eq('follower_id', profile.id).in('following_id', authorIds) : { data: [] },
    postIds.length ? supabase.from('community_likes').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : { data: [] },
    postIds.length ? supabase.from('community_saves').select('post_id').eq('profile_id', profile.id).in('post_id', postIds) : { data: [] },
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const followingIds = new Set((follows || []).map((follow: any) => follow.following_id));
  const likedPostIds = new Set((likes || []).map((like: any) => like.post_id));
  const savedPostIds = new Set((saves || []).map((save: any) => save.post_id));
  const fallbackSubmissionByKey = new Map<string, string>();
  (communitySubmissions || []).forEach((submission: any) => { const key = `${submission.profile_id}:${submission.exercise_id}`; if (!fallbackSubmissionByKey.has(key) && submission.file_url) fallbackSubmissionByKey.set(key, submission.file_url); });
  const feedPosts = (posts || []).map((post: any) => { const exercise = related(post.exercises); const author = related(post.profiles); const submission = related(post.submissions); const fallbackMedia = fallbackSubmissionByKey.get(`${post.profile_id}:${post.exercise_id}`) || ''; return { id: post.id, authorId: post.profile_id, authorName: author?.name || 'Aluno VIP', authorAvatarUrl: author?.avatar_url || null, createdAt: post.created_at, exerciseTitle: exercise?.title || (post.exercise_id ? 'Atividade da comunidade' : null), exerciseSlug: exercise?.slug || null, caption: post.caption || 'Compartilhou uma prática.', mediaUrl: post.media_url || submission?.file_url || fallbackMedia || null, likesCount: post.likes_count || 0, commentsCount: post.comments_count || 0, canDelete: Boolean(profile?.id && profile.id === post.profile_id), isFollowing: followingIds.has(post.profile_id), isLiked: likedPostIds.has(post.id), isSaved: savedPostIds.has(post.id) }; });

  return (
    <AppShell>
      <main className="community-instagram-page">
        <aside className="community-side-nav">
          <Link className="community-brand" href="/aluno" prefetch><Headphones size={30} /><span>FOCO<small>EM CANTO</small></span></Link>
          <nav><Link href="/aluno" prefetch><Home size={28} /><span>Início</span></Link><Link href="/aluno/biblioteca" prefetch><BookOpen size={28} /><span>Biblioteca</span></Link><Link className="active" href="/aluno/comunidade" prefetch><Users size={28} /><span>Comunidade</span></Link><Link href="/aluno/perfil" prefetch><User size={28} /><span>Perfil</span></Link></nav>
          <Link className="community-support" href="/aluno/perfil" prefetch><Headphones size={20} /> Suporte</Link>
        </aside>
        <section className="community-main-feed">
          <header className="community-feed-topbar"><div><p className="eyebrow">Comunidade VIP</p><h1>Compartilhe sua evolução.</h1><p>Publique sua prática, receba apoio dos alunos e acompanhe o crescimento do grupo.</p></div><div className="community-top-actions"><Link className="community-bell" href="/aluno/notificacoes" aria-label="Notificações"><Bell size={20} /></Link><Link className="community-current-avatar-link" href="/aluno/perfil" aria-label="Perfil"><Avatar className="community-current-avatar" name={firstName} url={currentAvatarUrl} /></Link></div></header>
          <section className="community-create-strip"><div className="community-tabs"><a className="active" href="/aluno/comunidade">Para você</a><a href="/aluno/comunidade">Recentes</a><a href="/aluno/comunidade">Seguindo</a></div><details className="new-post-menu"><summary><Plus size={30} /><span>Nova publicação</span></summary><div className="new-post-options"><a href="#nova-publicacao"><FileText size={22} /><strong>Texto</strong><small>Compartilhe uma ideia, dúvida ou conquista.</small></a><Link href="/aluno/biblioteca"><Video size={22} /><strong>Dueto/atividade</strong><small>Escolha o módulo, grave e publique pelo envio.</small></Link></div></details></section>
          <section id="nova-publicacao" className="community-composer-instagram text-only-composer"><div className="composer-topline"><div className="avatar-ring mini"><Avatar name={firstName} url={currentAvatarUrl} /></div><strong>{firstName}</strong><small>Publicação de texto</small></div><form action="/api/community/posts" method="post"><textarea name="caption" placeholder="O que você treinou hoje? Compartilhe uma prática, dúvida, testemunho ou conquista..." /><div className="composer-actions-instagram"><span>Para publicar vídeo de dueto, escolha uma aula na biblioteca e envie a atividade.</span><button type="submit"><Send size={18} /> Publicar texto</button></div></form></section>
          <section className="community-social-feed"><HomeCommunityFeed initialPosts={feedPosts} /></section>
        </section>
      </main>
    </AppShell>
  );
}
