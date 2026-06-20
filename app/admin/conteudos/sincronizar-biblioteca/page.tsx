import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function SyncLibraryPage() {
  const supabase = createAdminClient();
  const [{ data: connection }, { data: modules }, { data: exercises }] = await Promise.all([
    supabase.from('google_drive_connections').select('id,updated_at').eq('id', 'default').maybeSingle(),
    supabase.from('modules').select('id,title,slug').order('sort_order'),
    supabase.from('exercises').select('id,title,media_type,difficulty,drive_url,modules(title)').order('updated_at', { ascending: false }).limit(80),
  ]);

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Google Drive Sync</p>
          <h1>Sincronizar biblioteca</h1>
          <p className="muted">Cole a pasta mae do Drive. Cada subpasta vira modulo e cada arquivo vira exercicio.</p>
        </div>
        <a className="button secondary" href="/admin/conteudos">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin/conteudos">Conteudos</a>
        <a href="/admin/conteudos/google-drive">Google Drive</a>
        <a href="/admin/conteudos/sincronizar-biblioteca">Sincronizar biblioteca</a>
      </nav>

      <section className="content-board">
        <article className="content-card">
          <p className="eyebrow">Conexao</p>
          <h2>{connection ? 'Drive conectado' : 'Drive nao conectado'}</h2>
          <p className="muted">{connection ? `Ultima conexao: ${connection.updated_at}` : 'Conecte o Google Drive antes de sincronizar.'}</p>
          <a className="button" href="/admin/google/connect">Conectar Google Drive</a>
        </article>

        <article className="content-card">
          <p className="eyebrow">Importacao automatica</p>
          <h2>Importar biblioteca completa</h2>
          <form className="admin-form" action="/admin/conteudos/sincronizar-biblioteca/importar" method="post">
            <label>Pasta mae do Drive<input name="root_folder_url" required placeholder="Cole o link da pasta principal" /></label>
            <label>Nivel padrao
              <select name="difficulty" defaultValue="1">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
            <button className="button" type="submit">Sincronizar biblioteca</button>
          </form>
        </article>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Edicao rapida</p>
            <h2>Exercicios importados</h2>
          </div>
        </div>
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
                <a className="button secondary" href={`/admin/conteudos/exercicios/${exercise.id}/editar`}>Editar titulo</a>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
