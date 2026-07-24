import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const REPLAY_DRIVE_REDIRECT_URI = 'https://escola.focoemcanto.com/admin/google/callback';

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}

function popupResponse(success: boolean, message: string) {
  const safeMessage = escapeHtml(message);
  const payload = JSON.stringify({ type: 'foco-google-drive-connected', success, message });
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><title>Google Drive</title></head><body style="font-family:system-ui;background:#111827;color:white;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;max-width:720px;padding:32px"><h2>${success ? 'Google Drive conectado!' : 'Falha na conexão'}</h2><p style="line-height:1.6;color:#d1d5db">${safeMessage}</p></div><script>window.opener?.postMessage(${JSON.stringify(payload)}, window.location.origin);${success ? 'setTimeout(()=>window.close(),900);' : ''}</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const popup = state === 'foco-live-recording';

  if (!code) {
    if (popup) return popupResponse(false, 'A autorização foi cancelada.');
    return NextResponse.redirect(new URL('/admin/conteudos/google-drive?erro=sem-code', request.url));
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: REPLAY_DRIVE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({} as any));
    const codeLabel = details.error || `HTTP ${response.status}`;
    const description = details.error_description || 'O Google recusou a troca do código de autorização pelo token.';
    console.error('Google OAuth token exchange failed', response.status, details);
    if (popup) return popupResponse(false, `${codeLabel}: ${description} Verifique se GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET pertencem exatamente ao mesmo cliente OAuth aberto no Google Cloud.`);
    return NextResponse.redirect(new URL(`/admin/conteudos/google-drive?erro=${encodeURIComponent(codeLabel)}`, request.url));
  }

  const tokens = await response.json();
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
  const supabase = createAdminClient();
  const { data: existing } = await supabase.from('google_drive_connections').select('refresh_token').eq('id', 'default').maybeSingle();

  const { error } = await supabase.from('google_drive_connections').upsert({
    id: 'default',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || existing?.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    if (popup) return popupResponse(false, `O Google autorizou, mas a conexão não pôde ser salva no banco: ${error.message}`);
    return NextResponse.redirect(new URL('/admin/conteudos/google-drive?erro=banco', request.url));
  }

  if (popup) return popupResponse(true, 'Você já pode escolher a pasta da gravação.');
  return NextResponse.redirect(new URL('/admin/conteudos/google-drive?sucesso=conectado', request.url));
}
