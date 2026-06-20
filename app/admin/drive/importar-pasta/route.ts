import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { driveFileLink, mediaTypeFromFile, slugify } from '@/lib/google/drive-utils';

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase.from('google_drive_connections').select('*').eq('id', 'default').maybeSingle();
  if (!data?.access_token) return null;
  return data.access_token as string;
}

async function listFolderFiles(folderId: string, token: string) {
  const params = new URLSearchParams();
  params.set('q', `'${folderId}' in parents and trashed = false`);
  params.set('fields', 'files(id,name,mimeType,webViewLink)');
  params.set('pageSize', '1000');
  params.set('supportsAllDrives', 'true');
  params.set('includeItemsFromAllDrives', 'true');
  params.set('orderBy', 'name');

  const response = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) return [] as Array<{ id: string; name: string; mimeType: string; webViewLink?: string }>;
  const data = await response.json() as { files?: Array<{ id: string; name: string; mimeType: string; webViewLink?: string }> };
  return data.files || [];
}

function isAllowedContent(file: { name: string; mimeType: string }) {
  const name = file.name.toLowerCase();
  if (file.mimeType === 'application/vnd.google-apps.folder') return false;
  if (name.includes('transcricao') || name.includes('transcrição')) return false;
  if (name.includes('meet recordings')) return false;
  return file.mimeType.includes('video') || file.mimeType.includes('audio') || name.endsWith('.mp4') || name.endsWith('.mp3') || name.endsWith('.wav');
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const moduleId = String(formData.get('module_id') || '');
  const folderId = String(formData.get('folder_id') || '');
  const token = await getAccessToken();

  if (!moduleId || !folderId || !token) {
    return NextResponse.redirect(new URL('/admin/biblioteca?erro=drive', request.url));
  }

  const supabase = createAdminClient();
  const files = (await listFolderFiles(folderId, token)).filter(isAllowedContent);
  const { count } = await supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('module_id', moduleId);
  let imported = 0;

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
      objective: 'Assista, pratique e envie sua resposta para avaliacao.',
      media_type: mediaTypeFromFile(file.name, file.mimeType),
      difficulty: 1,
      drive_url: driveUrl,
      media_url: driveUrl,
      is_active: true,
      sort_order: (count || 0) + index + 1,
    });
    imported++;
  }

  return NextResponse.redirect(new URL(`/admin/biblioteca/${moduleId}?sucesso=pasta&importados=${imported}`, request.url));
}
