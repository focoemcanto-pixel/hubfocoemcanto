import { cookies } from 'next/headers';
import { Camera, ChevronLeft } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
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

        <form className="ig-edit-form" action="/api/profile" method="post" encType="multipart/form-data">
          <section className="ig-edit-avatar-block">
            <label className="ig-edit-avatar">
              {profileAny?.avatar_url ? <img src={profileAny.avatar_url} alt={name || 'Aluno'} /> : <span>{initials(name)}</span>}
              <b><Camera size={18} /></b>
              <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" />
            </label>
            <p>Toque na foto para alterar</p>
          </section>

          <section className="ig-edit-fields">
            <label>Nome<input name="name" defaultValue={name} placeholder="Seu nome" /></label>
            <label>Nome de usuário<input name="headline" defaultValue={profileAny?.headline || ''} placeholder="ex: marcoscruz" /></label>
            <label>Bio<textarea name="bio" defaultValue={profileAny?.bio || ''} placeholder="Conte sobre sua voz, ministério, objetivo e o que está treinando..." /></label>
            <label>WhatsApp<input name="whatsapp" defaultValue={profileAny?.whatsapp || ''} placeholder="Opcional" /></label>
          </section>

          <button className="ig-save-profile-button" type="submit">Salvar alterações</button>
        </form>
      </main>
    </AppShell>
  );
}
