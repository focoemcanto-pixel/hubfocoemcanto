import { cookies } from 'next/headers';
import Link from 'next/link';
import { ChevronLeft, Heart, MessageCircle, UserPlus, Repeat2, AtSign } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

function timeAgo(value?: string | null) {
  if (!value) return 'agora';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name?: string | null) {
  return String(name || 'Aluno').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function related(value: unknown) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function iconFor(type: string) {
  if (type === 'comment') return <MessageCircle size={15} />;
  if (type === 'follow') return <UserPlus size={15} />;
  if (type === 'repost') return <Repeat2 size={15} />;
  if (type === 'mention') return <AtSign size={15} />;
  return <Heart size={15} fill="currentColor" />;
}

function tabClass(current: string, value: string) {
  return current === value ? 'active' : '';
}

function filterLabel(value: string) {
  if (value === 'seguindo') return 'Seguindo';
  if (value === 'comentarios') return 'Comentários';
  if (value === 'mencoes') return 'Menções';
  return 'Tudo';
}

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({ searchParams }: { searchParams?: Promise<{ filtro?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const currentFilter = query?.filtro || 'tudo';
  const email = (await cookies()).get('hub_access_email')?.value || '';
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null };
  const profileId = (profile as any)?.id;

  const [{ data: myPosts }, { data: followers }, { data: following }] = profileId ? await Promise.all([
    supabase.from('community_posts').select('id,caption,media_url,created_at,submissions(file_url)').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(100),
    supabase.from('community_follows').select('id,created_at,profiles!community_follows_follower_id_fkey(id,name,avatar_url)').eq('following_id', profileId).order('created_at', { ascending: false }).limit(30),
    supabase.from('community_follows').select('following_id').eq('follower_id', profileId),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];

  const postIds = (myPosts || []).map((post: any) => post.id).filter(Boolean);
  const postMap = new Map((myPosts || []).map((post: any) => [post.id, post]));

  const [{ data: comments }, { data: likes }, { data: reposts }] = profileId && postIds.length ? await Promise.all([
    supabase.from('community_comments').select('id,post_id,profile_id,created_at,comment,profiles(id,name,avatar_url)').in('post_id', postIds).order('created_at', { ascending: false }).limit(40),
    supabase.from('community_likes').select('id,post_id,profile_id,created_at,profiles(id,name,avatar_url)').in('post_id', postIds).order('created_at', { ascending: false }).limit(40),
    supabase.from('community_reposts').select('id,post_id,profile_id,created_at,profiles(id,name,avatar_url)').in('post_id', postIds).order('created_at', { ascending: false }).limit(30),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];

  const followingIds = new Set((following || []).map((item: any) => item.following_id));

  const mediaFor = (postId: string) => {
    const post = postMap.get(postId) as any;
    const submission = related(post?.submissions) as any;
    return post?.media_url || submission?.file_url || null;
  };

  const commentItems = (comments || []).map((item: any) => {
    const actor = related(item.profiles) as any;
    const isMention = String(item.comment || '').includes('@');
    return { type: isMention ? 'mention' : 'comment', actorId: actor?.id || null, date: item.created_at, name: actor?.name || 'Aluno VIP', avatarUrl: actor?.avatar_url || null, text: isMention ? `mencionou você: ${item.comment || 'nova menção'}` : `comentou: ${item.comment || 'nova mensagem'}`, mediaUrl: mediaFor(item.post_id), href: `/aluno/comunidade#post-${item.post_id || ''}` };
  });

  const likeItems = (likes || []).map((item: any) => {
    const actor = related(item.profiles) as any;
    return { type: 'like', actorId: actor?.id || null, date: item.created_at, name: actor?.name || 'Aluno VIP', avatarUrl: actor?.avatar_url || null, text: 'curtiu sua prática', mediaUrl: mediaFor(item.post_id), href: `/aluno/comunidade#post-${item.post_id || ''}` };
  });

  const repostItems = (reposts || []).map((item: any) => {
    const actor = related(item.profiles) as any;
    return { type: 'repost', actorId: actor?.id || null, date: item.created_at, name: actor?.name || 'Aluno VIP', avatarUrl: actor?.avatar_url || null, text: 'repostou sua prática', mediaUrl: mediaFor(item.post_id), href: `/aluno/comunidade#post-${item.post_id || ''}` };
  });

  const followItems = (followers || []).map((item: any) => {
    const actor = related(item.profiles) as any;
    return { type: 'follow', actorId: actor?.id || null, date: item.created_at, name: actor?.name || 'Aluno VIP', avatarUrl: actor?.avatar_url || null, text: 'começou a seguir você', mediaUrl: null, href: '/aluno/comunidade' };
  });

  const allItems = [...commentItems, ...likeItems, ...repostItems, ...followItems]
    .filter((item) => item.actorId !== profileId)
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 60);

  const items = allItems.filter((item) => {
    if (currentFilter === 'seguindo') return Boolean(item.actorId && followingIds.has(item.actorId));
    if (currentFilter === 'comentarios') return item.type === 'comment';
    if (currentFilter === 'mencoes') return item.type === 'mention';
    return true;
  });

  const today = items.filter((item) => Date.now() - new Date(item.date || 0).getTime() < 24 * 60 * 60 * 1000);
  const older = items.filter((item) => Date.now() - new Date(item.date || 0).getTime() >= 24 * 60 * 60 * 1000);

  const renderItem = (item: any, index: number) => (
    <Link className="ig-notification-row" href={item.href || '/aluno/comunidade'} prefetch key={`${item.type}-${item.date}-${index}`}>
      <span className="ig-notification-avatar-wrap">
        {item.avatarUrl ? <img className="ig-notification-avatar" src={item.avatarUrl} alt={item.name} /> : <span className="ig-notification-avatar fallback">{initials(item.name)}</span>}
        <span className={`ig-notification-badge ${item.type}`}>{iconFor(item.type)}</span>
      </span>
      <span className="ig-notification-copy"><strong>{item.name}</strong> {item.text}. <small>{timeAgo(item.date)}</small></span>
      {item.mediaUrl ? <span className="ig-notification-thumb"><video src={item.mediaUrl} muted playsInline preload="metadata" /></span> : item.type === 'follow' ? <span className="ig-follow-back">Seguir de volta</span> : null}
    </Link>
  );

  const emptyText = currentFilter === 'seguindo' ? 'Nenhuma notificação de pessoas que você segue ainda.' : currentFilter === 'comentarios' ? 'Nenhum comentário ainda.' : currentFilter === 'mencoes' ? 'Nenhuma menção ainda.' : 'Nenhuma notificação ainda.';

  return (
    <AppShell>
      <main className="ig-notifications-page">
        <header className="ig-notifications-header">
          <Link href="/aluno/comunidade" prefetch aria-label="Voltar"><ChevronLeft size={32} /></Link>
          <h1>Notificações</h1>
        </header>
        <nav className="ig-notification-tabs" aria-label="Filtros de notificações">
          <Link className={tabClass(currentFilter, 'tudo')} href="/aluno/notificacoes" prefetch>{filterLabel('tudo')}</Link>
          <Link className={tabClass(currentFilter, 'seguindo')} href="/aluno/notificacoes?filtro=seguindo" prefetch>{filterLabel('seguindo')}</Link>
          <Link className={tabClass(currentFilter, 'comentarios')} href="/aluno/notificacoes?filtro=comentarios" prefetch>{filterLabel('comentarios')}</Link>
          <Link className={tabClass(currentFilter, 'mencoes')} href="/aluno/notificacoes?filtro=mencoes" prefetch>{filterLabel('mencoes')}</Link>
        </nav>
        {items.length ? <section className="ig-notification-list">{today.length ? <><h2>Hoje</h2>{today.map(renderItem)}</> : null}{older.length ? <><h2>Anteriores</h2>{older.map(renderItem)}</> : null}</section> : <section className="ig-notifications-empty"><h3>{emptyText}</h3><p>Quando alguém curtir, comentar, repostar ou seguir você, tudo aparece aqui.</p></section>}
      </main>
    </AppShell>
  );
}
