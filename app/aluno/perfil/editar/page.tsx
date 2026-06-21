import { cookies } from 'next/headers';
import { ChevronLeft } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { ProfileEditor } from '@/components/profile-editor';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function initials(name?: string | null) {
  return String(name || 'Aluno VIP').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default async function EditProfilePage() {
  const email = (await cookies()).get('hub_access_email')?.value || '';
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('*').eq('email', email).maybeSingle() : { data: null };
  const profileAny = (profile || {}) as any;
  const name = profileAny?.name || '';

  return (
    <AppShell>
      <main className="ig-edit-profile-page">
        <header className="ig-edit-topbar">
          <a href="/aluno/perfil"><ChevronLeft size={24} /> Perfil</a>
          <strong>Editar perfil</strong>
          <span />
        </header>

        <ProfileEditor
          name={name}
          username={profileAny?.headline || ''}
          bio={profileAny?.bio || ''}
          whatsapp={profileAny?.whatsapp || ''}
          avatarUrl={profileAny?.avatar_url || ''}
          initials={initials(name)}
        />
      </main>
    </AppShell>
  );
}
