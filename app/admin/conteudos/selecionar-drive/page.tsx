import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase.from('google_drive_connections').select('*').eq('id', 'default').maybeSingle();

  if (!data?.access_token) return null;

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  const refreshToken = data.refresh_token as string | null;

  if (expiresAt > Date.now() + 1000 * 60 * 5 || !refreshToken) return data.access_token as string;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) return data.access_token as string;

  const tokens = await response.json();
  const expires = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();

  await supabase.from('google_drive_connections').upsert({
    id: 'default',
    access_token: tokens.access_token,
    refresh_token: refreshToken,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expires_at: expires,
    updated_at: new Date().toISOString(),
  });

  return tokens.access_token as string;
}

async function listChildren(folderId: string, token: string) {
  const params = new URLSearchParams();
  params.set('q', `'${folderId}' in parents and trashed = false`);
  params.set('fields', 'files(id,name,mimeType,webViewLink)');
  params.set('pageSize', '1000');
  params.set('supportsAllDrives', 'true');
  params.set('includeItemsFromAllDrives', 'true');
  params.set('orderBy', 'folder,name');

  const response = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) return [] as DriveItem[];
  const data = await response.json() as { files?: DriveItem[] };
  return data.files || [];
}

export default async function SelectDriveFolderPage({ searchParams }: { searchParams: Promise<{ folder?: string; name?: string }> }) {
  const params = await searchParams;
  const folderId = params.folder || 'root';
  const folderName = params.name || 'Meu Drive';
  const token = await getAccessToken();
  const items = token ? await listChildren(folderId, token) : [];
  const folders = items.filter((item) => item.mimeType === 'application/vnd.google-apps.folder');
  const files = items.filter((item) => item.mimeType !== 'application/vnd.google-apps.folder');

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Selecionar no Drive</p>
          <h1>{folderName}</h1>
          <p className="muted">Navegue pelas pastas, escolha a pasta mae e sincronize a biblioteca automaticamente.</p>
        </div>
        <a className="button secondary" href="/admin/drive">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin/conteudos/selecionar-drive">Meu Drive</a>
        <a href="/admin/conteudos/google-drive">Conexao</a>
        <a href="/admin/conteudos/sincronizar-biblioteca">Colar link</a>
      </nav>

      {!token ? (
        <section className="card admin-section">
          <h2>Google Drive nao conectado</h2>
          <p className="muted">Conecte sua conta antes de selecionar uma pasta.</p>
          <a className="button" href="/admin/google/connect">Conectar Google Drive</a>
        </section>
      ) : (
        <section className="content-board admin-section">
          <article className="content-card">
            <p className="eyebrow">Pasta atual</p>
            <h2>{folderName}</h2>
            <p className="muted">{folders.length} pastas e {files.length} arquivos encontrados.</p>
            <form action="/admin/conteudos/sincronizar-biblioteca/importar" method="post" className="admin-form">
              <input type="hidden" name="root_folder_url" value={folderId} />
              <label>Nivel padrao
                <select name="difficulty" defaultValue="1">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </label>
              <button className="button" type="submit">Sincronizar esta pasta</button>
            </form>
          </article>

          <article className="content-card">
            <p className="eyebrow">Pastas</p>
            <h2>Escolha uma pasta</h2>
            <div className="admin-list">
              {folders.map((folder) => (
                <div className="admin-row" key={folder.id}>
                  <div>
                    <span className="pill">Pasta</span>
                    <h3>{folder.name}</h3>
                    <p className="muted">Abra para ver subpastas e arquivos.</p>
                  </div>
                  <a className="button secondary" href={`/admin/conteudos/selecionar-drive?folder=${folder.id}&name=${encodeURIComponent(folder.name)}`}>Abrir</a>
                </div>
              ))}
              {folders.length === 0 ? <p className="muted">Nenhuma pasta encontrada aqui.</p> : null}
            </div>
          </article>
        </section>
      )}

      {token ? (
        <section className="card admin-section">
          <p className="eyebrow">Arquivos nesta pasta</p>
          <h2>Preview</h2>
          <div className="admin-list">
            {files.slice(0, 20).map((file) => (
              <div className="admin-row" key={file.id}>
                <div>
                  <span className="pill">Arquivo</span>
                  <h3>{file.name}</h3>
                  <p className="muted">{file.mimeType}</p>
                </div>
                {file.webViewLink ? <a className="button secondary" href={file.webViewLink}>Abrir</a> : null}
              </div>
            ))}
            {files.length === 0 ? <p className="muted">Nenhum arquivo direto nesta pasta.</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
