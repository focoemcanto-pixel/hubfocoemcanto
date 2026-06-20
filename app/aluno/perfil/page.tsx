import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('*').eq('auth_user_id', user.id).single()
    : { data: null };

  return (
    <AppShell>
      <main className="page">
        <section className="card">
          <p className="eyebrow">Meu perfil</p>
          <h1 className="hero-title">{profile?.name || 'Aluno VIP'}</h1>
          <p className="muted">{profile?.email || user?.email}</p>
          <div className="grid" style={{ marginTop: 20 }}>
            <article className="card"><p className="stat">0</p><p className="muted">atividades enviadas</p></article>
            <article className="card"><p className="stat">0</p><p className="muted">avaliações recebidas</p></article>
            <article className="card"><p className="stat">5.0</p><p className="muted">média prevista</p></article>
          </div>
          <form action="/auth/logout" method="post" style={{ marginTop: 20 }}>
            <button className="button secondary" type="submit">Sair</button>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
