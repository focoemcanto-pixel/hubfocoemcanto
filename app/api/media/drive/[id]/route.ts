import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ACCESS_CACHE_MS = 55 * 60 * 1000;
const LESSON_ACCESS_CACHE_MS = 5 * 60 * 1000;
const allowedFileCache = new Map<string, number>();
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

type Params = { params: Promise<{ id: string }> };

type ConnectionRow = {
  id: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  token_type?: string | null;
};

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

async function canAccessLessonFile(fileId: string) {
  const cachedUntil = allowedFileCache.get(fileId) || 0;
  if (cachedUntil > Date.now()) return true;

  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  if (!email) return false;

  const supabase = createAdminClient();

  const [{ data: profile }, { data: lessons }] = await Promise.all([
    supabase.from('profiles').select('id,email').eq('email', email).maybeSingle(),
    supabase
      .from('exercises')
      .select('id,drive_url,media_url,audio_url,is_active')
      .eq('is_active', true)
      .or(`drive_url.ilike.%${fileId}%,media_url.ilike.%${fileId}%,audio_url.ilike.%${fileId}%`)
      .limit(1),
  ]);

  if (!profile) return false;
  const allowed = Boolean((lessons || []).some((lesson) => {
    const ids = [lesson.drive_url, lesson.media_url, lesson.audio_url].map(driveFileId).filter(Boolean);
    return ids.includes(fileId);
  }));

  if (allowed) allowedFileCache.set(fileId, Date.now() + LESSON_ACCESS_CACHE_MS);
  return allowed;
}

async function loadAccess() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token;

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

  const rowExpiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (rowExpiresAt > Date.now() + 60_000 || !row.refresh_token) {
    cachedAccessToken = { token: row.access_token, expiresAt: rowExpiresAt || Date.now() + ACCESS_CACHE_MS };
    return row.access_token;
  }

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

  if (!refresh.ok) {
    cachedAccessToken = { token: row.access_token, expiresAt: Date.now() + 5 * 60 * 1000 };
    return row.access_token;
  }

  const json = await refresh.json();
  const expiresAt = Date.now() + Number(json.expires_in || 3600) * 1000;
  const expires = new Date(expiresAt).toISOString();

  await supabase.from('google_drive_connections').upsert({
    id: row.id,
    access_token: json.access_token,
    refresh_token: row.refresh_token,
    scope: json.scope || row.scope,
    token_type: json.token_type || row.token_type,
    expires_at: expires,
    updated_at: new Date().toISOString(),
  });

  cachedAccessToken = { token: json.access_token as string, expiresAt };
  return json.access_token as string;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const allowed = await canAccessLessonFile(id);
    if (!allowed) return NextResponse.json({ error: 'media_not_allowed' }, { status: 403 });

    const access = await loadAccess();
    if (!access) return NextResponse.json({ error: 'drive_not_connected' }, { status: 401 });

    const range = request.headers.get('range');
    const driveHeaders: Record<string, string> = { authorization: `Bearer ${access}` };
    if (range) driveHeaders.range = range;

    const upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
      headers: driveHeaders,
      cf: { cacheTtl: range ? 300 : 900, cacheEverything: false },
    } as RequestInit & { cf?: { cacheTtl?: number; cacheEverything?: boolean } });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'drive_video_unavailable', status: upstream.status }, { status: upstream.status || 500 });
    }

    const headers = new Headers();
    headers.set('content-type', upstream.headers.get('content-type') || 'video/mp4');
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'private, max-age=300, stale-while-revalidate=600');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('content-disposition', 'inline');
    headers.set('vary', 'Range');
    const len = upstream.headers.get('content-length');
    const rangeHeader = upstream.headers.get('content-range');
    if (len) headers.set('content-length', len);
    if (rangeHeader) headers.set('content-range', rangeHeader);

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return NextResponse.json({ error: 'drive_proxy_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
