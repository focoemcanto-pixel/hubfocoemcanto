import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data: exercise }, { data: modules }] = await Promise.all([
    supabase.from('exercises').select('*').eq('id', id).single(),
    supabase.from('modules').select('id,title').order('sort_order'),
  ]);

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Editar exercicio</p>
          <h1>Ajustar titulo</h1>
          <p className="muted">Corrija nome, modulo, tipo e descricao sem mexer no arquivo original do Drive.</p>
        </div>
        <a className="button secondary" href="/admin/conteudos/sincronizar-biblioteca">Voltar</a>
      </section>

      <section className="content-card admin-section">
        <form className="admin-form" action={`/admin/conteudos/exercicios/${id}/editar/salvar`} method="post">
          <label>Titulo<input name="title" defaultValue={exercise?.title || ''} required /></label>
          <label>Modulo
            <select name="module_id" defaultValue={exercise?.module_id || ''} required>
              {(modules || []).map((module) => (
                <option value={module.id} key={module.id}>{module.title}</option>
              ))}
            </select>
          </label>
          <div className="admin-form-grid">
            <label>Tipo
              <select name="media_type" defaultValue={exercise?.media_type || 'video'}>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="dueto">Dueto</option>
              </select>
            </label>
            <label>Nivel
              <select name="difficulty" defaultValue={String(exercise?.difficulty || 1)}>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
          </div>
          <label>Link Drive<input name="drive_url" defaultValue={exercise?.drive_url || ''} /></label>
          <label>Descricao<textarea name="description" defaultValue={exercise?.description || ''} /></label>
          <label>Objetivo<textarea name="objective" defaultValue={exercise?.objective || ''} /></label>
          <button className="button" type="submit">Salvar alteracoes</button>
        </form>
      </section>
    </main>
  );
}
