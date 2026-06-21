import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function initials(name?: string | null) {
  return String(name || 'Aluno VIP').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function usernameFrom(profile: any, email: string) {
  const base = String(profile?.headline || profile?.name || email?.split('@')[0] || 'aluno')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._]+/g, '')
    .slice(0, 24);
  return base || 'alunovip';
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const cookieStore = await cookies();
  const { data: { user } } = await supabase.auth.getUser();
  const accessEmail = cookieStore.get('hub_access_email')?.value || user?.email || '';

  const { data: profile } = accessEmail
    ? await admin.from('profiles').select('*').eq('email', accessEmail).maybeSingle()
    : user
      ? await admin.from('profiles').select('*').eq('auth_user_id', user.id).maybeSingle()
      : { data: null };

  const profileAny = (profile || {}) as any;
  const profileId = profileAny?.id;
  const [{ count: postsCount }, { count: followersCount }, { count: followingCount }, { count: submissionsCount }, { count: reviewsCount }, { count: pendingCount }] = profileId
    ? await Promise.all([
        admin.from('community_posts').select('id', { count: 'exact', head: true }).eq('profile_id', profileId),
        admin.from('community_follows').select('id', { count: 'exact', head: true }).eq('following_id', profileId),
        admin.from('community_follows').select('id', { count: 'exact', head: true }).eq('follower_id', profileId),
        admin.from('submissions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId),
        admin.from('submissions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId).in('status', ['reviewed', 'approved', 'needs_rework']),
        admin.from('submissions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId).eq('status', 'pending_review'),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  const name = profileAny?.name || 'Aluno VIP';
  const handle = usernameFrom(profileAny, accessEmail);
  const bio = profileAny?.bio || '🎤 Estudando técnica vocal\n🎵 Treinando segunda voz\n🔥 Evoluindo no Foco em Canto';

  return (
    <AppShell>
      <main className="ig-profile-page">
        <header className="ig-profile-topbar">
          <strong>@{handle}</strong>
          <span>Aluno VIP</span>
        </header>

        <section className="ig-profile-header">
          <Link className="ig-avatar" href="/aluno/perfil/editar" aria-label="Editar foto de perfil">
            {profileAny?.avatar_url ? <img src={profileAny.avatar_url} alt={name} /> : <span>{initials(name)}</span>}
            <b>+</b>
          </Link>

          <div className="ig-profile-stats">
            <Link href="/aluno/comunidade"><strong>{postsCount || 0}</strong><span>publicações</span></Link>
            <Link href="/aluno/perfil/seguidores"><strong>{followersCount || 0}</strong><span>seguidores</span></Link>
            <Link href="/aluno/perfil/seguindo"><strong>{followingCount || 0}</strong><span>seguindo</span></Link>
          </div>
        </section>

        <section className="ig-profile-bio">
          <h1>{name}</h1>
          <span className="ig-vip-pill">★ Aluno VIP</span>
          <p>{bio}</p>
          <small>Aluno desde 2026 · Foco em Harmonia</small>
        </section>

        <section className="ig-profile-actions">
          <Link href="/aluno/perfil/editar">Editar perfil</Link>
          <Link href="/aluno/avaliacoes">Avaliações</Link>
        </section>

        <section className="ig-profile-shortcuts">
          <Link href="/aluno/avaliacoes">
            <div><strong>Minhas avaliações</strong><span>{reviewsCount || 0} recebidas · {pendingCount || 0} aguardando</span></div>
            <b>›</b>
          </Link>
          <Link href="/aluno/comunidade">
            <div><strong>Minhas publicações</strong><span>Veja e interaja com a comunidade</span></div>
            <b>›</b>
          </Link>
          <Link href="/aluno/biblioteca">
            <div><strong>Atividades enviadas</strong><span>{submissionsCount || 0} exercícios gravados</span></div>
            <b>›</b>
          </Link>
          <Link href="/aluno/comunidade?tab=seguindo">
            <div><strong>Seguindo</strong><span>Acompanhe alunos que você segue</span></div>
            <b>›</b>
          </Link>
        </section>

        <section className="ig-profile-grid-preview">
          <h2>Resumo</h2>
          <div>
            <article><strong>{submissionsCount || 0}</strong><span>atividades</span></article>
            <article><strong>{reviewsCount || 0}</strong><span>avaliações</span></article>
            <article><strong>{pendingCount || 0}</strong><span>na fila</span></article>
          </div>
        </section>

        <section className="ig-profile-menu">
          <Link href="/aluno/perfil/editar">Configurações do perfil</Link>
          <Link href="/aluno/comunidade">Comunidade</Link>
          <Link href="/aluno/biblioteca">Biblioteca</Link>
          <form action="/auth/logout" method="post"><button type="submit">Sair da conta</button></form>
        </section>
      </main>
    </AppShell>
  );
}
