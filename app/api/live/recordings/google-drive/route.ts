import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase.from('google_drive_connections').select('*').eq('id', 'default').maybeSingle();
  if (!data?.refresh_token) return null;
  if (data.access_token && data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.access_token as string;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: data.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) return null;
  const token = await response.json();
  await supabase.from('google_drive_connections').update({
    access_token: token.access_token,
    expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', 'default');
  return token.access_token as string;
}

export async function GET(request: Request) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ connected: false, folders: [] });
  const url = new URL(request.url);
  const parent = url.searchParams.get('parent') || 'root';
  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and '${parent}' in parents`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&orderBy=name&pageSize=100`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return NextResponse.json({ connected: true, folders: [], error: 'Não foi possível listar as pastas.' }, { status: 502 });
  const data = await response.json();
  return NextResponse.json({ connected: true, parent, folders: data.files || [] });
}
