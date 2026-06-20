import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminContentPage() {
  const supabase = createAdminClient();
  const [{ data: modules }, { data: exercises }] = await Promise.all([
    supabase.from('modules').select('id,title,slug,description,sort_order').order('sort_order'),
    supabase.from('exercises').select('id,title,slug,media_type,difficulty,drive_url,modules(title)').order('created_at', { ascending: false }).limit(40),
  ]);

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Conteudos</p>
          <h1>Biblioteca do VIP</h1>
          <p className="muted">Cadastre modulos, exercicios, videos do Drive, audios e materiais de treino.</p>
        </div>
        <a className="button secondary" href="/admin">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/conteudos">Conteudos</a>
        <a href="/admin/alunos">Alunos</a>
        <a href="/admin/avaliacoes">Avaliacoes</a>
      </nav>

      <section className="content-board">
        <article className="content-card">
          <p className="eyebrow">Novo exercicio</p>
          <h2>Cadastrar material</h2>
          <form className="admin-form" action="/admin/conteudos/criar" method="post">
            <label>Modulo
              <select name="module_id" required>
                {(modules || []).map((module) => (
                  <option value={module.id} key={module.id}>{module.title}</option>
                ))}
              </select>
            </label>
            <label>Titulo<input name="title" required placeholder="Ex: Maranata - Segunda voz" /></label>
            <div className="admin-form-grid">
              <label>Tipo
                <select name="media_type" defaultValue="video">
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="dueto">Dueto</option>
                </select>
              </label>
              <label>Nivel
                <select name="difficulty" defaultValue="1">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </label>
            </div>
            <label>Link do Google Drive<input name="drive_url" placeholder="Cole o link do video ou audio" /></label>
            <label>Descricao<textarea name="description" placeholder="Explique o treino para o aluno" /></label>
            <label>Objetivo<textarea name="objective" placeholder="O que o aluno precisa praticar" /></label>
            <button className="button" type="submit">Salvar exercicio</button>
          </form>
        </article>

        <article className="content-card">
          <p className="eyebrow">Cadastrados</p>
          <h2>Ultimos exercicios</h2>
          <div className="admin-list">
            {(exercises || []).map((exercise: any) => {
              const module = Array.isArray(exercise.modules) ? exercise.modules[0] : exercise.modules;
              return (
                <div className="admin-row" key={exercise.id}>
                  <div>
                    <span className="pill">{exercise.media_type} - nivel {exercise.difficulty}</span>
                    <h3>{exercise.title}</h3>
                    <p className="muted">{module?.title || 'Sem modulo'}</p>
                  </div>
                  {exercise.drive_url ? <a className="button secondary" href={exercise.drive_url}>Drive</a> : null}
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </main>
  );
}
