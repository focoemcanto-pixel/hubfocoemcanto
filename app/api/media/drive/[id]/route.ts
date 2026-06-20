import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

type ConnectionRow = {
  id: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  token_type?: string | null;
};

async function loadAccess() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('google_drive_connections')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = data as ConnectionRow | null;
  if (!row?.access_token) return null;

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000 || !row.refresh_token) return row.access_token;

  const refresh = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!refresh.ok) return row.access_token;
  const json = await refresh.json();
  const expires = new Date(Date.now() + Number(json.expires_in || 3600) * 1000).toISOString();

  await supabase.from('google_drive_connections').upsert({
    id: row.id,
    access_token: json.access_token,
    refresh_token: row.refresh_token,
    scope: json.scope || row.scope,
    token_type: json.token_type || row.token_type,
    expires_at: expires,
    updated_at: new Date().toISOString(),
  });

  return json.access_token as string;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const access = await loadAccess();
    if (!access) return NextResponse.json({ error: 'drive_not_connected' }, { status: 401 });

    const range = request.headers.get('range');
    const driveHeaders: Record<string, string> = { authorization: `Bearer ${access}` };
    if (range) driveHeaders.range = range;

    const upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
      headers: driveHeaders,
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'drive_video_unavailable', status: upstream.status }, { status: upstream.status || 500 });
    }

    const headers = new Headers();
    headers.set('content-type', upstream.headers.get('content-type') || 'video/mp4');
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'private, max-age=120');
    const len = upstream.headers.get('content-length');
    const rangeHeader = upstream.headers.get('content-range');
    if (len) headers.set('content-length', len);
    if (rangeHeader) headers.set('content-range', rangeHeader);

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return NextResponse.json({ error: 'drive_proxy_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
