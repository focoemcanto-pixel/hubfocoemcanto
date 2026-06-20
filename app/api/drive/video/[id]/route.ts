import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'edge';

type Params = { params: Promise<{ id: string }> };

type DriveConnection = {
  id: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
};

async function refreshAccessToken(connection: DriveConnection) {
  if (!connection.refresh_token) return connection.access_token || undefined;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) return connection.access_token || undefined;

  const tokens = await response.json();
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
  const supabase = createAdminClient();
  await supabase.from('google_drive_connections').update({
    access_token: tokens.access_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', connection.id);

  return tokens.access_token as string;
}

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('google_drive_connections')
    .select('id,access_token,refresh_token,expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const connection = data as DriveConnection | null;
  if (!connection) return undefined;

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  const shouldRefresh = !connection.access_token || !expiresAt || expiresAt < Date.now() + 60_000;
  if (shouldRefresh) return refreshAccessToken(connection);

  return connection.access_token || undefined;
}

async function fetchDriveFile(id: string, token: string, range?: string) {
  return fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: {
      authorization: `Bearer ${token}`,
      ...(range ? { range } : {}),
    },
  });
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const token = await getAccessToken();

  if (!token || !id) {
    return NextResponse.json({ error: 'drive_not_connected' }, { status: 401 });
  }

  const range = request.headers.get('range') || undefined;
  const response = await fetchDriveFile(id, token, range);

  if (!response.ok || !response.body) {
    return NextResponse.json({ error: 'drive_video_unavailable', status: response.status }, { status: response.status || 500 });
  }

  const headers = new Headers();
  headers.set('content-type', response.headers.get('content-type') || 'video/mp4');
  headers.set('accept-ranges', response.headers.get('accept-ranges') || 'bytes');
  headers.set('cache-control', 'private, max-age=120');
  headers.set('cross-origin-resource-policy', 'same-origin');
  const contentLength = response.headers.get('content-length');
  const contentRange = response.headers.get('content-range');
  if (contentLength) headers.set('content-length', contentLength);
  if (contentRange) headers.set('content-range', contentRange);

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
