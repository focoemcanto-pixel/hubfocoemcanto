import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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
  const { data, error } = await supabase
    .from('google_drive_connections')
    .select('id,access_token,refresh_token,expires_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`drive_connection_query_failed:${error.message}`);

  const connection = data as DriveConnection | null;
  if (!connection) return undefined;

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  const shouldRefresh = !connection.access_token || !expiresAt || expiresAt < Date.now() + 60_000;
  if (shouldRefresh) return refreshAccessToken(connection);

  return connection.access_token || undefined;
}

async function fetchDriveFile(id: string, token: string) {
  return fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const token = await getAccessToken();

    if (!token || !id) {
      return NextResponse.json({ error: 'drive_not_connected' }, { status: 401 });
    }

    const response = await fetchDriveFile(id, token);

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      return NextResponse.json({ error: 'drive_video_unavailable', status: response.status, details: details.slice(0, 500) }, { status: response.status || 500 });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'video/mp4';

    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type': contentType,
        'content-length': String(buffer.byteLength),
        'accept-ranges': 'bytes',
        'cache-control': 'private, max-age=120',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'drive_proxy_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
