import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data: module }, { data: exercises }] = await Promise.all([
    supabase.from('modules').select('*').eq('id', id).single(),
    supabase.from('exercises').select('*').eq('module_id', id).order('sort_order'),
  ]);

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Modulo</p>
          <h1>{module?.title || 'Modulo'}</h1>
          <p className="muted">Crie aulas manualmente ou importe videos e audios do Drive direto para este modulo.</p>
        </div>
        <a className="button secondary" href="/admin/biblioteca">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin/biblioteca">Biblioteca</a>
        <a href={`/admin/conteudos/selecionar-drive?module=${id}`}>Importar do Drive</a>
        <a href={`/aluno/biblioteca/${module?.slug || ''}`}>Ver como aluno</a>
      </nav>

      <section className="admin-grid admin-section">
        <article className="admin-stat">
          <span>Importacao inteligente</span>
          <strong>Drive</strong>
          <p className="muted">Escolha uma pasta ou arquivo especifico. Nada de puxar o Drive inteiro.</p>
          <a className="button" href={`/admin/conteudos/selecionar-drive?module=${id}`}>Selecionar arquivo ou pasta</a>
        </article>
        <article className="admin-stat">
          <span>Conteudos</span>
          <strong>{exercises?.length || 0}</strong>
          <p className="muted">Aulas, audios e duetos dentro deste modulo.</p>
        </article>
      </section>

      <section className="content-board admin-section">
        <article className="content-card">
          <p className="eyebrow">Editar modulo</p>
          <h2>Dados principais</h2>
          <form className="admin-form" action={`/admin/biblioteca/${id}/salvar`} method="post">
            <label>Titulo<input name="title" defaultValue={module?.title || ''} required /></label>
            <label>Descricao<textarea name="description" defaultValue={module?.description || ''} /></label>
            <label>Ordem<input name="sort_order" type="number" defaultValue={module?.sort_order || 1} /></label>
            <button className="button" type="submit">Salvar modulo</button>
          </form>
        </article>

        <article className="content-card">
          <p className="eyebrow">Nova aula manual</p>
          <h2>Adicionar conteudo</h2>
          <form className="admin-form" action="/admin/conteudos/criar" method="post">
            <input type="hidden" name="module_id" value={id} />
            <label>Titulo<input name="title" required placeholder="Ex: Aula 01 - Segunda voz" /></label>
            <div className="admin-form-grid">
              <label>Tipo
                <select name="media_type" defaultValue="video">
                  <option value="video">Aula em video</option>
                  <option value="audio">Exercicio em audio</option>
                  <option value="dueto">Dueto</option>
                </select>
              </label>
              <label>Nivel
                <select name="difficulty" defaultValue="1">
                  <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
                </select>
              </label>
            </div>
            <label>Link Drive<input name="drive_url" placeholder="Cole o arquivo do Drive" /></label>
            <label>Descricao<textarea name="description" /></label>
            <label>Objetivo<textarea name="objective" /></label>
            <button className="button" type="submit">Adicionar</button>
          </form>
        </article>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div><p className="eyebrow">Conteudos</p><h2>Aulas e exercicios</h2></div>
          <a href={`/admin/conteudos/selecionar-drive?module=${id}`}>Importar do Drive</a>
        </div>
        <div className="admin-list">
          {(exercises || []).map((exercise: any, index: number) => (
            <div className="admin-row" key={exercise.id}>
              <div>
                <span className="pill">{index + 1} - {exercise.media_type} - nivel {exercise.difficulty}</span>
                <h3>{exercise.title}</h3>
                <p className="muted">{exercise.description || 'Sem descricao'}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="button secondary" href={`/aluno/aula/${exercise.slug}`}>Ver aula</a>
                <a className="button secondary" href={`/admin/conteudos/exercicios/${exercise.id}/editar`}>Editar</a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
