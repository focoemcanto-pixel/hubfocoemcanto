import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { driveFileLink, driveFolderId, mediaTypeFromFile, slugify } from '@/lib/google/drive-utils';

const MEDIA_BUCKET = 'lesson-media';

function extensionFromName(name: string) {
  const match = name.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() || 'mp4';
}

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('google_drive_connections')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (!data?.access_token) return null;

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  const refreshToken = data.refresh_token as string | null;

  if (expiresAt > Date.now() + 1000 * 60 * 5 || !refreshToken) {
    return data.access_token as string;
  }

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

async function cacheDriveFile(params: {
  accessToken: string;
  file: { id: string; name: string; mimeType: string; webViewLink?: string };
  moduleId: string;
  index: number;
}) {
  const { accessToken, file, moduleId, index } = params;
  const mediaType = mediaTypeFromFile(file.name, file.mimeType);

  if (!['video', 'audio'].includes(mediaType)) {
    return file.webViewLink || driveFileLink(file.id);
  }

  const supabase = createAdminClient();
  const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!fileResponse.ok) {
    return file.webViewLink || driveFileLink(file.id);
  }

  const contentType = fileResponse.headers.get('content-type') || file.mimeType || (mediaType === 'audio' ? 'audio/mpeg' : 'video/mp4');
  const buffer = await fileResponse.arrayBuffer();
  const ext = extensionFromName(file.name);
  const safeTitle = slugify(file.name.replace(/\.[^/.]+$/, '')) || 'aula';
  const storagePath = `${moduleId}/${String(index + 1).padStart(3, '0')}-${safeTitle}-${file.id}.${ext}`;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });

  if (error) {
    return file.webViewLink || driveFileLink(file.id);
  }

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const moduleId = String(formData.get('module_id') || '');
  const folderUrl = String(formData.get('folder_url') || '');
  const difficulty = Number(formData.get('difficulty') || 1);
  const folderId = driveFolderId(folderUrl);
  const accessToken = await getAccessToken();

  if (!moduleId || !folderId) {
    return NextResponse.redirect(new URL('/admin/conteudos/google-drive?erro=dados', request.url));
  }

  if (!accessToken) {
    return NextResponse.redirect(new URL('/admin/conteudos/google-drive?erro=nao-conectado', request.url));
  }

  const params = new URLSearchParams();
  params.set('q', `'${folderId}' in parents and trashed = false`);
  params.set('fields', 'files(id,name,mimeType,webViewLink,thumbnailLink)');
  params.set('pageSize', '1000');
  params.set('supportsAllDrives', 'true');
  params.set('includeItemsFromAllDrives', 'true');

  const driveResponse = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!driveResponse.ok) {
    return NextResponse.redirect(new URL('/admin/conteudos/google-drive?erro=drive', request.url));
  }

  const data = await driveResponse.json() as { files?: Array<{ id: string; name: string; mimeType: string; webViewLink?: string }> };
  const files = (data.files || []).filter((file) => !file.mimeType.includes('folder'));
  const supabase = createAdminClient();
  const rows = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const title = file.name.replace(/\.[^/.]+$/, '');
    const cachedUrl = await cacheDriveFile({ accessToken, file, moduleId, index });
    rows.push({
      module_id: moduleId,
      title,
      slug: `${slugify(title)}-${Date.now().toString(36)}-${index}`,
      description: '',
      objective: 'Assista ao material e envie sua pratica para avaliacao.',
      media_type: mediaTypeFromFile(file.name, file.mimeType),
      difficulty,
      drive_url: file.webViewLink || driveFileLink(file.id),
      media_url: cachedUrl,
      is_active: true,
      sort_order: index + 1,
    });
  }

  if (rows.length > 0) {
    await supabase.from('exercises').insert(rows);
  }

  return NextResponse.redirect(new URL(`/admin/conteudos/google-drive?sucesso=importados&total=${rows.length}`, request.url));
}
