import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';

export default async function StudentPage() {
  const supabase = await createClient();
  const { data: modules } = await supabase
    .from('modules')
    .select('id,title,slug,description,icon,sort_order')
    .order('sort_order');

  return (
    <AppShell>
      <main className="page">
        <section className="card">
          <p className="eyebrow">Grupo VIP</p>
          <h1 className="hero-title">Sua jornada vocal começa aqui</h1>
          <p className="muted">Treine harmonia, envie atividades e acompanhe sua evolução.</p>
          <div className="split" style={{ marginTop: 18 }}>
            <a className="button" href="/aluno/trilhas">Continuar treino</a>
            <a className="button secondary" href="/aluno/enviar">Enviar atividade</a>
          </div>
        </section>

        <h2 className="section-title" style={{ marginTop: 24 }}>Trilhas do VIP</h2>
        <section className="grid">
          {(modules || []).map((module) => (
            <article className="card" key={module.id}>
              <p className="eyebrow">Trilha</p>
              <h2>{module.title}</h2>
              <p className="muted">{module.description}</p>
              <div className="progress"><span style={{ width: '18%' }} /></div>
              <p className="muted">18% concluído</p>
              <a className="button secondary" href={`/aluno/trilhas/${module.slug}`}>Abrir trilha</a>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
