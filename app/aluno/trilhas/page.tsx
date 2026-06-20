import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function TracksPage() {
  const supabase = createAdminClient();
  const { data: modules } = await supabase
    .from('modules')
    .select('id,title,slug,description,sort_order')
    .order('sort_order');

  return (
    <AppShell>
      <main className="page tracks-page">
        <section className="tracks-hero">
          <p className="eyebrow">Biblioteca VIP</p>
          <h1>Areas de estudo</h1>
          <p className="muted">Escolha uma trilha, pratique com video ou audio e envie sua resposta para avaliacao.</p>
        </section>
        <section className="tracks-grid">
          {(modules || []).map((module, index) => (
            <a className="track-card" key={module.id} href={`/aluno/trilhas/${module.slug}`}>
              <span>Modulo {index + 1}</span>
              <h2>{module.title}</h2>
              <p>{module.description}</p>
              <div className="track-footer">
                <small>Videos e audios</small>
                <strong>Abrir</strong>
              </div>
            </a>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
