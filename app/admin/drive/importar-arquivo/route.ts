import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { driveFileLink, mediaTypeFromFile, slugify } from '@/lib/google/drive-utils';

const MEDIA_BUCKET = 'lesson-media';

function extensionFromName(name: string, mediaType: string) {
  const match = name.match(/\.([a-zA-Z0-9]+)$/);
  if (match?.[1]) return match[1].toLowerCase();
  return mediaType === 'audio' ? 'mp3' : 'mp4';
}

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase.from('google_drive_connections').select('*').eq('id', 'default').maybeSingle();
  if (!data?.access_token) return null;

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 1000 * 60 * 5 || !data.refresh_token) return data.access_token as string;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: data.refresh_token,
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
    refresh_token: data.refresh_token,
    scope: tokens.scope || data.scope,
    token_type: tokens.token_type || data.token_type,
    expires_at: expires,
    updated_at: new Date().toISOString(),
  });

  return tokens.access_token as string;
}

async function cacheDriveFile(params: { fileId: string; name: string; mimeType: string; token: string; moduleId: string }) {
  const { fileId, name, mimeType, token, moduleId } = params;
  const mediaType = mediaTypeFromFile(name, mimeType);
  const driveUrl = driveFileLink(fileId);
  if (!['video', 'audio'].includes(mediaType)) return driveUrl;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!response.ok) return driveUrl;

  const supabase = createAdminClient();
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || mimeType || (mediaType === 'audio' ? 'audio/mpeg' : 'video/mp4');
  const title = name.replace(/\.[^/.]+$/, '');
  const safeTitle = slugify(title) || 'aula';
  const ext = extensionFromName(name, mediaType);
  const storagePath = `${moduleId}/single-${safeTitle}-${fileId}.${ext}`;

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
  const fileId = String(formData.get('file_id') || '');
  const name = String(formData.get('name') || '').trim();
  const mimeType = String(formData.get('mime_type') || '');
  const webViewLink = String(formData.get('web_view_link') || '').trim();

  if (!moduleId || !fileId || !name) {
    return NextResponse.redirect(new URL('/admin/biblioteca?erro=arquivo', request.url));
  }

  const cleanTitle = name.replace(/\.[^/.]+$/, '');
  const driveUrl = webViewLink || driveFileLink(fileId);
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('exercises')
    .select('id')
    .eq('module_id', moduleId)
    .eq('drive_url', driveUrl)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.redirect(new URL(`/admin/biblioteca/${moduleId}?aviso=ja-importado`, request.url));
  }

  const { count } = await supabase
    .from('exercises')
    .select('*', { count: 'exact', head: true })
    .eq('module_id', moduleId);

  const token = await getAccessToken();
  const cachedUrl = token ? await cacheDriveFile({ fileId, name, mimeType, token, moduleId }) : driveUrl;

  const { error } = await supabase.from('exercises').insert({
    module_id: moduleId,
    title: cleanTitle,
    slug: `${slugify(cleanTitle)}-${fileId.slice(0, 6)}-${Date.now().toString(36)}`,
    description: '',
    objective: 'Assista, pratique e envie sua resposta para avaliacao.',
    media_type: mediaTypeFromFile(name, mimeType),
    difficulty: 1,
    drive_url: driveUrl,
    media_url: cachedUrl,
    is_active: true,
    sort_order: (count || 0) + 1,
  });

  if (error) {
    return NextResponse.redirect(new URL(`/admin/biblioteca/${moduleId}?erro=${encodeURIComponent(error.message)}`, request.url));
  }

  return NextResponse.redirect(new URL(`/admin/biblioteca/${moduleId}?sucesso=arquivo`, request.url));
}
