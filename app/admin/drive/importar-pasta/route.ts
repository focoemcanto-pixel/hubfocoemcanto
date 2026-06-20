import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { driveFileLink, mediaTypeFromFile, slugify } from '@/lib/google/drive-utils';

const MEDIA_BUCKET = 'lesson-media';

type DriveConnection = {
  id: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  token_type?: string | null;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
};

function extensionFromName(name: string, mediaType: string) {
  const match = name.match(/\.([a-zA-Z0-9]+)$/);
  if (match?.[1]) return match[1].toLowerCase();
  return mediaType === 'audio' ? 'mp3' : 'mp4';
}

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('google_drive_connections').select('*').eq('id', 'default').maybeSingle();
  if (error) throw new Error(error.message);
  const connection = data as DriveConnection | null;
  if (!connection?.access_token) return null;

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 1000 * 60 * 5 || !connection.refresh_token) {
    return connection.access_token;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: connection.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) return connection.access_token;
  const tokens = await response.json();
  const expires = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();

  await supabase.from('google_drive_connections').upsert({
    id: 'default',
    access_token: tokens.access_token,
    refresh_token: connection.refresh_token,
    scope: tokens.scope || connection.scope,
    token_type: tokens.token_type || connection.token_type,
    expires_at: expires,
    updated_at: new Date().toISOString(),
  });

  return tokens.access_token as string;
}

async function listFolderFiles(folderId: string, token: string) {
  const params = new URLSearchParams();
  params.set('q', `'${folderId}' in parents and trashed = false`);
  params.set('fields', 'files(id,name,mimeType,webViewLink,thumbnailLink)');
  params.set('pageSize', '1000');
  params.set('supportsAllDrives', 'true');
  params.set('includeItemsFromAllDrives', 'true');
  params.set('orderBy', 'name');

  const response = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) return [] as DriveFile[];
  const data = await response.json() as { files?: DriveFile[] };
  return data.files || [];
}

function isAllowedContent(file: { name: string; mimeType: string }) {
  const name = file.name.toLowerCase();
  if (file.mimeType === 'application/vnd.google-apps.folder') return false;
  if (name.includes('transcricao') || name.includes('transcrição')) return false;
  if (name.includes('meet recordings')) return false;
  return file.mimeType.includes('video') || file.mimeType.includes('audio') || name.endsWith('.mp4') || name.endsWith('.mp3') || name.endsWith('.wav');
}

async function cacheDriveFile(file: DriveFile, token: string, moduleId: string, index: number) {
  const mediaType = mediaTypeFromFile(file.name, file.mimeType);
  const driveUrl = file.webViewLink || driveFileLink(file.id);
  if (!['video', 'audio'].includes(mediaType)) return driveUrl;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) return driveUrl;

  const supabase = createAdminClient();
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || file.mimeType || (mediaType === 'audio' ? 'audio/mpeg' : 'video/mp4');
  const title = file.name.replace(/\.[^/.]+$/, '');
  const safeTitle = slugify(title) || 'aula';
  const ext = extensionFromName(file.name, mediaType);
  const storagePath = `${moduleId}/${String(index + 1).padStart(3, '0')}-${safeTitle}-${file.id}.${ext}`;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });

  if (error) return driveUrl;
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
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
    const { data: existing } = await supabase.from('exercises').select('id').eq('module_id', moduleId).eq('drive_url', driveUrl).maybeSingle();
    if (existing?.id) continue;

    const cachedUrl = await cacheDriveFile(file, token, moduleId, index);

    const { error } = await supabase.from('exercises').insert({
      module_id: moduleId,
      title: cleanTitle,
      slug: `${slugify(cleanTitle)}-${file.id.slice(0, 6)}-${index}`,
      description: '',
      objective: 'Assista, pratique e envie sua resposta para avaliacao.',
      media_type: mediaTypeFromFile(file.name, file.mimeType),
      difficulty: 1,
      drive_url: driveUrl,
      media_url: cachedUrl,
      thumbnail_url: file.thumbnailLink || null,
      is_active: true,
      sort_order: (count || 0) + index + 1,
    });
    if (!error) imported++;
  }

  return NextResponse.redirect(new URL(`/admin/biblioteca/${moduleId}?sucesso=pasta&importados=${imported}`, request.url));
}
