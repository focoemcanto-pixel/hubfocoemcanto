import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function initials(name?: string | null) {
  return String(name || 'Aluno').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default async function SocialProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('id,name,email,bio,headline,avatar_url').eq('id', id).maybeSingle();
  const [{ count: postsCount }, { count: followersCount }, { count: followingCount }] = await Promise.all([
    supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('profile_id', id),
    supabase.from('community_follows').select('id', { count: 'exact', head: true }).eq('following_id', id),
    supabase.from('community_follows').select('id', { count: 'exact', head: true }).eq('follower_id', id),
  ]);

  if (!profile) return <AppShell><main className="page"><h1>Perfil não encontrado</h1><Link href="/aluno/comunidade">Voltar</Link></main></AppShell>;

  return (
    <AppShell>
      <main className="ig-profile-page">
        <Link href="/aluno/perfil/seguindo" style={{ color: '#f5c76b', textDecoration: 'none', fontWeight: 900 }}>← Voltar</Link>
        <section className="premium-profile-hero" style={{ marginTop: 16 }}>
          <div className="premium-profile-head">
            <div className="premium-profile-avatar">
              {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.name || 'Aluno'} /> : <span>{initials(profile.name)}</span>}
            </div>
            <div className="premium-profile-identity">
              <h1>{profile.name || 'Aluno VIP'}</h1>
              <p>@{profile.headline || profile.email?.split('@')[0] || 'aluno'}</p>
              <div className="bio">{profile.bio || 'Evoluindo na comunidade Foco em Canto.'}</div>
            </div>
          </div>
          <nav className="premium-profile-stats" aria-label="Estatísticas do perfil">
            <a href="/aluno/comunidade"><strong>{postsCount || 0}</strong><span>publicações</span></a>
            <a href="/aluno/comunidade"><strong>{followersCount || 0}</strong><span>seguidores</span></a>
            <a href="/aluno/comunidade"><strong>{followingCount || 0}</strong><span>seguindo</span></a>
            <a href="/aluno/comunidade"><strong>VIP</strong><span>comunidade</span></a>
          </nav>
        </section>
      </main>
    </AppShell>
  );
}
