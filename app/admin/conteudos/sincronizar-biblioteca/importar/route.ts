import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { driveFileLink, driveFolderId, mediaTypeFromFile, slugify } from '@/lib/google/drive-utils';

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase.from('google_drive_connections').select('*').eq('id', 'default').maybeSingle();
  return data?.access_token as string | null;
}

async function listDriveChildren(folderId: string, accessToken: string) {
  const params = new URLSearchParams();
  params.set('q', `'${folderId}' in parents and trashed = false`);
  params.set('fields', 'files(id,name,mimeType,webViewLink)');
  params.set('pageSize', '1000');
  params.set('supportsAllDrives', 'true');
  params.set('includeItemsFromAllDrives', 'true');

  const response = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error('drive-list-error');
  const data = await response.json() as { files?: Array<{ id: string; name: string; mimeType: string; webViewLink?: string }> };
  return data.files || [];
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const rootFolderUrl = String(formData.get('root_folder_url') || '');
  const difficulty = Number(formData.get('difficulty') || 1);
  const rootFolderId = driveFolderId(rootFolderUrl);
  const accessToken = await getAccessToken();
  const supabase = createAdminClient();

  if (!accessToken) return NextResponse.redirect(new URL('/admin/conteudos/sincronizar-biblioteca?erro=drive-nao-conectado', request.url));
  if (!rootFolderId) return NextResponse.redirect(new URL('/admin/conteudos/sincronizar-biblioteca?erro=pasta', request.url));

  const rootChildren = await listDriveChildren(rootFolderId, accessToken);
  const folders = rootChildren.filter((item) => item.mimeType === 'application/vnd.google-apps.folder');
  const rootFiles = rootChildren.filter((item) => item.mimeType !== 'application/vnd.google-apps.folder');

  let imported = 0;
  let modulesCreated = 0;

  async function ensureModule(title: string, order: number) {
    const slug = slugify(title);
    const { data: existing } = await supabase.from('modules').select('id').eq('slug', slug).maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created } = await supabase
      .from('modules')
      .insert({ title, slug, description: `Conteudos importados da pasta ${title}.`, sort_order: order, is_active: true })
      .select('id')
      .single();

    modulesCreated++;
    return created?.id as string;
  }

  async function importFilesIntoModule(moduleId: string, files: typeof rootChildren) {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
      const driveUrl = file.webViewLink || driveFileLink(file.id);

      const { data: existing } = await supabase.from('exercises').select('id').eq('drive_url', driveUrl).maybeSingle();
      if (existing?.id) continue;

      await supabase.from('exercises').insert({
        module_id: moduleId,
        title: cleanTitle,
        slug: `${slugify(cleanTitle)}-${file.id.slice(0, 6)}`,
        description: 'Material importado do Google Drive.',
        objective: 'Assista ou ouca o material e envie sua pratica para avaliacao.',
        media_type: mediaTypeFromFile(file.name, file.mimeType),
        difficulty,
        drive_url: driveUrl,
        media_url: driveUrl,
        is_active: true,
        sort_order: index + 1,
      });
      imported++;
    }
  }

  if (rootFiles.length > 0) {
    const moduleId = await ensureModule('Biblioteca Geral', 1);
    await importFilesIntoModule(moduleId, rootFiles);
  }

  for (let folderIndex = 0; folderIndex < folders.length; folderIndex++) {
    const folder = folders[folderIndex];
    const moduleId = await ensureModule(folder.name, folderIndex + 2);
    const files = await listDriveChildren(folder.id, accessToken);
    await importFilesIntoModule(moduleId, files.filter((file) => file.mimeType !== 'application/vnd.google-apps.folder'));
  }

  return NextResponse.redirect(new URL(`/admin/conteudos/sincronizar-biblioteca?sucesso=sync&importados=${imported}&modulos=${modulesCreated}`, request.url));
}
