import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { driveRedirectUri } from '@/lib/google/drive-utils';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/admin/conteudos/google-drive?erro=sem-code', request.url));
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: driveRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    return NextResponse.redirect(new URL('/admin/conteudos/google-drive?erro=oauth', request.url));
  }

  const tokens = await response.json();
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('google_drive_connections')
    .select('refresh_token')
    .eq('id', 'default')
    .maybeSingle();

  await supabase.from('google_drive_connections').upsert({
    id: 'default',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || existing?.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.redirect(new URL('/admin/conteudos/google-drive?sucesso=conectado', request.url));
}
