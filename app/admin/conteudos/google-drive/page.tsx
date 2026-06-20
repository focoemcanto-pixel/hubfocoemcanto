import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function GoogleDrivePage() {
  const supabase = createAdminClient();
  const [{ data: modules }, { data: connection }] = await Promise.all([
    supabase.from('modules').select('id,title').order('sort_order'),
    supabase.from('google_drive_connections').select('id,updated_at,expires_at').eq('id', 'default').maybeSingle(),
  ]);

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Google Drive</p>
          <h1>Importar pasta</h1>
          <p className="muted">Conecte sua conta Google, cole o link da pasta e importe os arquivos como exercicios.</p>
        </div>
        <a className="button secondary" href="/admin/conteudos">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/conteudos">Conteudos</a>
        <a href="/admin/conteudos/google-drive">Google Drive</a>
      </nav>

      <section className="content-board">
        <article className="content-card">
          <p className="eyebrow">Conexao</p>
          <h2>{connection ? 'Drive conectado' : 'Drive nao conectado'}</h2>
          <p className="muted">{connection ? `Ultima conexao: ${connection.updated_at}` : 'Autorize o Hub para ler suas pastas e arquivos.'}</p>
          <a className="button" href="/admin/google/connect">Conectar Google Drive</a>
        </article>

        <article className="content-card">
          <p className="eyebrow">Importacao</p>
          <h2>Importar arquivos da pasta</h2>
          <form className="admin-form" action="/admin/conteudos/google-drive/importar" method="post">
            <label>Modulo
              <select name="module_id" required>
                {(modules || []).map((module) => (
                  <option value={module.id} key={module.id}>{module.title}</option>
                ))}
              </select>
            </label>
            <label>Link da pasta do Drive<input name="folder_url" required placeholder="Cole aqui o link da pasta" /></label>
            <label>Nivel padrao
              <select name="difficulty" defaultValue="1">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
            <button className="button" type="submit">Importar exercicios</button>
          </form>
        </article>
      </section>
    </main>
  );
}
