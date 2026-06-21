import { cookies } from 'next/headers';
import { ChevronLeft, Bell, Heart, MessageCircle, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

function timeAgo(value?: string | null) {
  if (!value) return 'agora';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${Math.max(1, m)}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const email = (await cookies()).get('hub_access_email')?.value || '';
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null };
  const profileId = (profile as any)?.id;

  const [{ data: comments }, { data: likes }, { data: followers }] = profileId ? await Promise.all([
    supabase.from('community_comments').select('id,created_at,comment,profiles(name,avatar_url),community_posts!inner(profile_id,caption)').eq('community_posts.profile_id', profileId).order('created_at', { ascending: false }).limit(8),
    supabase.from('community_likes').select('id,created_at,profiles(name,avatar_url),community_posts!inner(profile_id,caption)').eq('community_posts.profile_id', profileId).order('created_at', { ascending: false }).limit(8),
    supabase.from('community_follows').select('id,created_at,profiles!community_follows_follower_id_fkey(name,avatar_url)').eq('following_id', profileId).order('created_at', { ascending: false }).limit(8),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];

  const items = [
    ...(comments || []).map((item: any) => ({ type: 'comment', date: item.created_at, name: item.profiles?.name || 'Aluno VIP', text: `comentou: ${item.comment || 'nova mensagem'}` })),
    ...(likes || []).map((item: any) => ({ type: 'like', date: item.created_at, name: item.profiles?.name || 'Aluno VIP', text: 'curtiu sua prática' })),
    ...(followers || []).map((item: any) => ({ type: 'follow', date: item.created_at, name: item.profiles?.name || 'Aluno VIP', text: 'começou a seguir você' })),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 20);

  return (
    <AppShell>
      <main className="ig-profile-page">
        <header className="ig-edit-topbar"><a href="/aluno/comunidade"><ChevronLeft size={24} /> Comunidade</a><strong>Notificações</strong><span /></header>
        <section className="ig-profile-shortcuts">
          {items.length ? items.map((item, index) => <a key={`${item.type}-${index}`} href="/aluno/comunidade"><div style={{display:'flex',alignItems:'center',gap:12}}><span className="community-bell">{item.type === 'comment' ? <MessageCircle size={18} /> : item.type === 'like' ? <Heart size={18} /> : <UserPlus size={18} />}</span><div><strong>{item.name}</strong><span>{item.text} · {timeAgo(item.date)}</span></div></div><Bell size={18} /></a>) : <div className="empty-community-feed"><h3>Nenhuma notificação ainda.</h3><p>Curtidas, comentários e novos seguidores aparecem aqui.</p></div>}
        </section>
      </main>
    </AppShell>
  );
}
