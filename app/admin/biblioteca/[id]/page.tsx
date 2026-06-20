import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function driveThumb(url?: string | null) {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w640` : '';
}

export default async function AdminModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const [{ data: module }, { data: exercises }] = await Promise.all([
    supabase.from('modules').select('*').eq('id', id).single(),
    supabase.from('exercises').select('*').eq('module_id', id).order('sort_order'),
  ]);

  return (
    <main className="page admin-shell">
      <section className="admin-hero admin-hero-library">
        <div>
          <p className="eyebrow">Modulo</p>
          <h1>{module?.title || 'Modulo'}</h1>
          <p className="muted">Monte este modulo como uma vitrine premium: capa, aulas, ordem, thumbnails e importacao do Drive.</p>
          <p className="muted">Capas recomendadas: modulo 320x480, thumbnail de aula 1280x720.</p>
        </div>
        <a className="button secondary" href="/admin/biblioteca">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin/biblioteca">Biblioteca</a>
        <a href={`/admin/conteudos/selecionar-drive?module=${id}`}>Importar do Drive</a>
        <a href={`/aluno/biblioteca/${module?.slug || ''}`}>Ver aluno</a>
      </nav>

      <section className="admin-grid admin-section">
        <article className="admin-stat">
          <span>Importacao correta</span>
          <strong>Modulo → Drive</strong>
          <p className="muted">Entre na pasta certa e importe apenas os arquivos deste modulo.</p>
          <a className="button" href={`/admin/conteudos/selecionar-drive?module=${id}`}>Selecionar pasta ou arquivo</a>
        </article>
        <article className="admin-stat">
          <span>Conteudos</span>
          <strong>{exercises?.length || 0}</strong>
          <p className="muted">Use a selecao em massa para remover aulas erradas.</p>
        </article>
        <article className="admin-stat">
          <span>Capas</span>
          <strong>320x480</strong>
          <p className="muted">Ideal para cards verticais estilo Netflix.</p>
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
            <label>Capa do modulo <small className="muted">Proporcao ideal: 320x480</small><input name="cover_url" defaultValue={module?.cover_url || ''} placeholder="Cole a URL da capa" /></label>
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

      <section className="card admin-section admin-lessons-panel">
        <div className="section-heading">
          <div><p className="eyebrow">Conteudos</p><h2>Aulas e exercicios</h2></div>
          <a href={`/admin/conteudos/selecionar-drive?module=${id}`}>Importar do Drive</a>
        </div>
        <form action={`/admin/biblioteca/${id}/aulas/excluir`} method="post">
          <div className="admin-bulk-bar">
            <span>Selecione aulas importadas por engano</span>
            <button className="button secondary danger" type="submit">Excluir selecionadas</button>
          </div>
          <div className="admin-list lesson-manager-list">
            {(exercises || []).map((exercise: any, index: number) => {
              const thumb = exercise.thumbnail_url || driveThumb(exercise.drive_url || exercise.media_url);
              return (
                <div className="lesson-manager-row" key={exercise.id}>
                  <label className="lesson-check"><input type="checkbox" name="lesson_id" value={exercise.id} /></label>
                  <div className="lesson-thumb">{thumb ? <img src={thumb} alt="" /> : <span>{exercise.media_type || 'video'}</span>}</div>
                  <div className="lesson-info">
                    <span className="pill">{index + 1} - {exercise.media_type} - nivel {exercise.difficulty}</span>
                    <h3>{exercise.title}</h3>
                    <p className="muted">{exercise.description || 'Sem descricao'}</p>
                  </div>
                  <div className="lesson-actions">
                    <a className="button secondary" href={`/aluno/aula/${exercise.slug}`}>Ver aula</a>
                    <a className="button secondary" href={`/admin/conteudos/exercicios/${exercise.id}/editar`}>Editar</a>
                  </div>
                </div>
              );
            })}
          </div>
        </form>
      </section>
    </main>
  );
}
