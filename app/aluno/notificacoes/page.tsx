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
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
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

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const email = (await cookies()).get('hub_access_email')?.value || '';
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null };
  const profileId = (profile as any)?.id;

  const [{ data: comments }, { data: likes }, { data: followers }] = profileId ? await Promise.all([
    supabase.from('community_comments').select('id,created_at,comment,profiles(name,avatar_url),community_posts!inner(id,profile_id,caption,media_url,submissions(file_url))').eq('community_posts.profile_id', profileId).order('created_at', { ascending: false }).limit(16),
    supabase.from('community_likes').select('id,created_at,profiles(name,avatar_url),community_posts!inner(id,profile_id,caption,media_url,submissions(file_url))').eq('community_posts.profile_id', profileId).order('created_at', { ascending: false }).limit(16),
    supabase.from('community_follows').select('id,created_at,profiles!community_follows_follower_id_fkey(name,avatar_url)').eq('following_id', profileId).order('created_at', { ascending: false }).limit(16),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];

  const items = [
    ...(comments || []).map((item: any) => { const post = related(item.community_posts) as any; const actor = related(item.profiles) as any; const submission = related(post?.submissions) as any; return { type: 'comment', date: item.created_at, name: actor?.name || 'Aluno VIP', avatarUrl: actor?.avatar_url || null, text: `comentou: ${item.comment || 'nova mensagem'}`, mediaUrl: post?.media_url || submission?.file_url || null, href: `/aluno/comunidade#post-${post?.id || ''}` }; }),
    ...(likes || []).map((item: any) => { const post = related(item.community_posts) as any; const actor = related(item.profiles) as any; const submission = related(post?.submissions) as any; return { type: 'like', date: item.created_at, name: actor?.name || 'Aluno VIP', avatarUrl: actor?.avatar_url || null, text: 'curtiu sua prática', mediaUrl: post?.media_url || submission?.file_url || null, href: `/aluno/comunidade#post-${post?.id || ''}` }; }),
    ...(followers || []).map((item: any) => { const actor = related(item.profiles) as any; return { type: 'follow', date: item.created_at, name: actor?.name || 'Aluno VIP', avatarUrl: actor?.avatar_url || null, text: 'começou a seguir você', mediaUrl: null, href: '/aluno/comunidade' }; }),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 30);

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

  return (
    <AppShell>
      <main className="ig-notifications-page">
        <header className="ig-notifications-header">
          <Link href="/aluno/comunidade" prefetch aria-label="Voltar"><ChevronLeft size={34} /></Link>
          <h1>Notificações</h1>
        </header>
        <div className="ig-notification-tabs"><span className="active">Tudo</span><span>Pessoas que você segue</span><span>Comentários</span><span>Menções</span></div>
        {items.length ? <section className="ig-notification-list">{today.length ? <><h2>Hoje</h2>{today.map(renderItem)}</> : null}{older.length ? <><h2>Ontem</h2>{older.map(renderItem)}</> : null}</section> : <section className="empty-community-feed"><h3>Nenhuma notificação ainda.</h3><p>Curtidas, comentários e novos seguidores aparecem aqui.</p></section>}
      </main>
    </AppShell>
  );
}
