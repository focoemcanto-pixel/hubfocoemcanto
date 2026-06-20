import { createClient } from '@/lib/supabase/server';

export default async function AdminPage() {
  const supabase = await createClient();
  const [{ count: students }, { count: pending }, { data: submissions }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('submissions').select('id,note,file_url,status,created_at,profiles(name,email),exercises(title)').eq('status', 'pending_review').order('created_at', { ascending: false }).limit(20),
  ]);

  return (
    <main className="page">
      <p className="eyebrow">Admin</p>
      <h1 className="hero-title">Painel do professor</h1>
      <p className="muted">Gerencie alunos, conteúdos, envios e avaliações.</p>
      <section className="grid">
        <article className="card"><h2>Alunos</h2><p className="stat">{students || 0}</p></article>
        <article className="card"><h2>Pendentes</h2><p className="stat">{pending || 0}</p></article>
        <article className="card"><h2>Status</h2><p className="stat">VIP</p></article>
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Fila de avaliação</h2>
        {(submissions || []).map((item) => (
          <div className="card" key={item.id} style={{ marginTop: 12 }}>
            <p className="eyebrow">{item.status}</p>
            <h3>{item.exercises?.title || 'Atividade'}</h3>
            <p className="muted">{item.profiles?.name || item.profiles?.email}</p>
            <p>{item.note}</p>
            {item.file_url ? <a className="button secondary" href={item.file_url}>Abrir envio</a> : null}
          </div>
        ))}
      </section>
    </main>
  );
}
