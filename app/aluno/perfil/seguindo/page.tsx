import { cookies } from 'next/headers';
import { ChevronLeft } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

function initials(name?: string | null) {
  return String(name || 'Aluno').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export const dynamic = 'force-dynamic';

export default async function FollowingPage() {
  const email = (await cookies()).get('hub_access_email')?.value || '';
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null };
  const { data: rows } = (profile as any)?.id
    ? await supabase.from('community_follows').select('profiles!community_follows_following_id_fkey(id,name,avatar_url)').eq('follower_id', (profile as any).id)
    : { data: [] };

  return (
    <AppShell>
      <main className="ig-profile-page">
        <header className="ig-edit-topbar"><a href="/aluno/perfil"><ChevronLeft size={24} /> Perfil</a><strong>Seguindo</strong><span /></header>
        <section className="ig-profile-shortcuts">
          {(rows || []).length ? (rows || []).map((row: any, index: number) => {
            const person = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
            return <a key={person?.id || index} href="/aluno/comunidade"><div style={{display:'flex',alignItems:'center',gap:12}}><span className="instagram-author-avatar">{person?.avatar_url ? <img src={person.avatar_url} alt="" /> : <span>{initials(person?.name)}</span>}</span><strong>{person?.name || 'Aluno VIP'}</strong></div><b>Seguindo</b></a>;
          }) : <div className="empty-community-feed"><h3>Você ainda não segue ninguém.</h3><p>Quando seguir alguém, o perfil aparecerá aqui.</p></div>}
        </section>
      </main>
    </AppShell>
  );
}
