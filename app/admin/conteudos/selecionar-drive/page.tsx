import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type DriveItem = { id: string; name: string; mimeType: string; webViewLink?: string };

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase.from('google_drive_connections').select('*').eq('id', 'default').maybeSingle();
  if (!data?.access_token) return null;
  return data.access_token as string;
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

function isContent(file: DriveItem) {
  const name = file.name.toLowerCase();
  if (name.includes('transcricao') || name.includes('transcrição')) return false;
  if (name.includes('meet recordings')) return false;
  return file.mimeType.includes('video') || file.mimeType.includes('audio') || name.endsWith('.mp4') || name.endsWith('.mp3') || name.endsWith('.wav');
}

export default async function SelectDriveFolderPage({ searchParams }: { searchParams: Promise<{ folder?: string; name?: string; module?: string }> }) {
  const params = await searchParams;
  const selectedModuleId = params.module || '';
  const supabase = createAdminClient();

  if (!selectedModuleId) {
    const { data: modules } = await supabase.from('modules').select('id,title,description').order('sort_order');
    const visibleModules = (modules || []).filter((module: any) => String(module.description || '').toLowerCase().indexOf('importados da pasta') === -1);
    return (
      <main className="page admin-shell">
        <section className="admin-hero">
          <div>
            <p className="eyebrow">Drive bloqueado</p>
            <h1>Escolha um modulo primeiro</h1>
            <p className="muted">O Drive nao cria modulos. Ele apenas anexa aulas dentro de um modulo que voce criou.</p>
          </div>
          <a className="button secondary" href="/admin/biblioteca">Voltar</a>
        </section>
        <section className="card admin-section">
          <p className="eyebrow">Modulos</p>
          <h2>Selecione onde deseja importar</h2>
          <div className="admin-list">
            {visibleModules.map((module: any) => (
              <div className="admin-row" key={module.id}>
                <div><h3>{module.title}</h3><p className="muted">Importar arquivos para este modulo.</p></div>
                <a className="button secondary" href={`/admin/conteudos/selecionar-drive?module=${module.id}`}>Selecionar Drive</a>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const folderId = params.folder || 'root';
  const folderName = params.name || 'Meu Drive';
  const token = await getAccessToken();
  const [{ data: module }, items] = await Promise.all([
    supabase.from('modules').select('id,title').eq('id', selectedModuleId).single(),
    token ? listChildren(folderId, token) : Promise.resolve([] as DriveItem[]),
  ]);
  const folders = items.filter((item) => item.mimeType === 'application/vnd.google-apps.folder');
  const files = items.filter((item) => item.mimeType !== 'application/vnd.google-apps.folder' && isContent(item));

  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Importar para: {module?.title || 'Modulo'}</p>
          <h1>{folderName}</h1>
          <p className="muted">Abra a pasta certa e importe somente o que pertence a este modulo.</p>
        </div>
        <a className="button secondary" href={`/admin/biblioteca/${selectedModuleId}`}>Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href={`/admin/biblioteca/${selectedModuleId}`}>Modulo</a>
        <a href={`/admin/conteudos/selecionar-drive?module=${selectedModuleId}`}>Meu Drive</a>
        <a href="/admin/conteudos/google-drive">Conexao</a>
      </nav>

      {!token ? (
        <section className="card admin-section">
          <h2>Google Drive nao conectado</h2>
          <p className="muted">Conecte sua conta antes de selecionar arquivos.</p>
          <a className="button" href="/admin/google/connect">Conectar Google Drive</a>
        </section>
      ) : (
        <section className="content-board admin-section">
          <article className="content-card">
            <p className="eyebrow">Destino fixo</p>
            <h2>{module?.title || 'Modulo'}</h2>
            <p className="muted">Tudo que voce importar aqui sera postado neste modulo.</p>
            <form action="/admin/drive/importar-pasta" method="post" className="admin-form">
              <input type="hidden" name="module_id" value={selectedModuleId} />
              <input type="hidden" name="folder_id" value={folderId} />
              <button className="button" type="submit">Importar pasta atual como aulas</button>
            </form>
          </article>

          <article className="content-card">
            <p className="eyebrow">Pastas</p>
            <h2>Navegue ate a pasta certa</h2>
            <div className="admin-list">
              {folders.map((folder) => (
                <div className="admin-row" key={folder.id}>
                  <div><span className="pill">Pasta</span><h3>{folder.name}</h3></div>
                  <a className="button secondary" href={`/admin/conteudos/selecionar-drive?module=${selectedModuleId}&folder=${folder.id}&name=${encodeURIComponent(folder.name)}`}>Abrir</a>
                </div>
              ))}
              {folders.length === 0 ? <p className="muted">Nenhuma pasta encontrada aqui.</p> : null}
            </div>
          </article>
        </section>
      )}

      {token ? (
        <section className="card admin-section">
          <div className="section-heading"><div><p className="eyebrow">Arquivos</p><h2>Importar para {module?.title}</h2></div></div>
          <div className="admin-list">
            {files.map((file) => (
              <div className="admin-row" key={file.id}>
                <div><span className="pill">{file.mimeType.includes('audio') ? 'Audio' : 'Video'}</span><h3>{file.name}</h3><p className="muted">Sera criado como aula deste modulo.</p></div>
                <form action="/admin/drive/importar-arquivo" method="post">
                  <input type="hidden" name="module_id" value={selectedModuleId} />
                  <input type="hidden" name="file_id" value={file.id} />
                  <input type="hidden" name="name" value={file.name} />
                  <input type="hidden" name="mime_type" value={file.mimeType} />
                  <input type="hidden" name="web_view_link" value={file.webViewLink || ''} />
                  <button className="button secondary" type="submit">Importar</button>
                </form>
              </div>
            ))}
            {files.length === 0 ? <p className="muted">Nenhum video ou audio encontrado nesta pasta.</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
