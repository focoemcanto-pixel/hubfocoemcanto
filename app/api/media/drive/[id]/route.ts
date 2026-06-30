import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const allowedFileCache = new Map<string, number>();
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

type Params = { params: Promise<{ id: string }> };
type ParsedRange = { start: number; end: number; size: number; header: string; contentLength: number };
type DriveConnection = { id: string; access_token?: string | null; refresh_token?: string | null; expires_at?: string | null };

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function parseRange(header: string | null, size: number): ParsedRange | null {
  if (!Number.isFinite(size) || size <= 0) return null;
  if (!header) {
    const end = Math.min(size - 1, DEFAULT_CHUNK_SIZE - 1);
    return { start: 0, end, size, header: `bytes=0-${end}`, contentLength: end + 1 };
  }
  const match = header.match(/bytes=(\d*)-(\d*)/i);
  if (!match) return null;
  const rawStart = match[1];
  const rawEnd = match[2];
  let start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd || 0));
  let end = rawEnd && rawStart ? Number(rawEnd) : size - 1;
  if (!rawEnd && rawStart) end = Math.min(size - 1, start + DEFAULT_CHUNK_SIZE - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
  end = Math.min(end, size - 1);
  return { start, end, size, header: `bytes=${start}-${end}`, contentLength: end - start + 1 };
}

function mediaTypeFromName(name?: string | null) {
  const value = String(name || '').toLowerCase();
  if (value.endsWith('.mov')) return 'video/quicktime';
  if (value.endsWith('.webm')) return 'video/webm';
  if (value.endsWith('.mp3')) return 'audio/mpeg';
  if (value.endsWith('.m4a') || value.endsWith('.aac')) return 'audio/mp4';
  if (value.endsWith('.wav')) return 'audio/wav';
  return 'video/mp4';
}

async function canAccessLessonFile(fileId: string) {
  const cachedUntil = allowedFileCache.get(fileId) || 0;
  if (cachedUntil > Date.now()) return true;
  const email = (await cookies()).get('hub_access_email')?.value;
  if (!email) return false;
  const supabase = createAdminClient();
  const [{ data: profile }, { data: lessons }] = await Promise.all([
    supabase.from('profiles').select('id').eq('email', email).maybeSingle(),
    supabase.from('exercises').select('drive_url,media_url,audio_url,is_active').eq('is_active', true).or(`drive_url.ilike.%${fileId}%,media_url.ilike.%${fileId}%,audio_url.ilike.%${fileId}%`).limit(1),
  ]);
  if (!profile) return false;
  const allowed = Boolean((lessons || []).some((lesson) => [lesson.drive_url, lesson.media_url, lesson.audio_url].map(driveFileId).includes(fileId)));
  if (allowed) allowedFileCache.set(fileId, Date.now() + 5 * 60 * 1000);
  return allowed;
}

async function refreshAccessToken(connection: DriveConnection) {
  if (!connection.refresh_token) return connection.access_token || null;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: connection.refresh_token, grant_type: 'refresh_token' }),
  });
  if (!response.ok) return connection.access_token || null;
  const tokens = await response.json();
  const expiresAt = Date.now() + Number(tokens.expires_in || 3600) * 1000;
  await createAdminClient().from('google_drive_connections').update({ access_token: tokens.access_token, expires_at: new Date(expiresAt).toISOString(), updated_at: new Date().toISOString() }).eq('id', connection.id);
  cachedAccessToken = { token: tokens.access_token, expiresAt };
  return tokens.access_token as string;
}

async function getAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token;
  const { data } = await createAdminClient().from('google_drive_connections').select('id,access_token,refresh_token,expires_at,updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const connection = data as DriveConnection | null;
  if (!connection?.access_token) return null;
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (!expiresAt || expiresAt < Date.now() + 60_000) return refreshAccessToken(connection);
  cachedAccessToken = { token: connection.access_token, expiresAt };
  return connection.access_token;
}

async function getMetadata(id: string, token: string | null) {
  if (!token) return null;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType,size&supportsAllDrives=true`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) return null;
  return response.json() as Promise<{ name?: string; mimeType?: string; size?: string }>;
}

async function fetchMedia(id: string, token: string | null, range: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (range) headers.range = range;
  const url = token
    ? `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`
    : `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`;
  return fetch(url, { headers, cache: 'no-store', redirect: 'follow' });
}

function responseHeaders(upstream: Response, metadata: any, range: ParsedRange | null) {
  const headers = new Headers();
  headers.set('content-type', metadata?.mimeType || upstream.headers.get('content-type') || mediaTypeFromName(metadata?.name));
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, max-age=1800, stale-while-revalidate=3600');
  headers.set('content-disposition', 'inline');
  headers.set('vary', 'Range');
  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${range.size}`);
    headers.set('content-length', String(range.contentLength));
  } else {
    const contentRange = upstream.headers.get('content-range');
    const contentLength = upstream.headers.get('content-length') || metadata?.size;
    if (contentRange) headers.set('content-range', contentRange);
    if (contentLength) headers.set('content-length', contentLength);
  }
  return headers;
}

export async function HEAD(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!(await canAccessLessonFile(id))) return NextResponse.json({ error: 'media_not_allowed' }, { status: 403 });
  const token = await getAccessToken().catch(() => null);
  const metadata = await getMetadata(id, token).catch(() => null);
  const headers = new Headers();
  headers.set('content-type', metadata?.mimeType || mediaTypeFromName(metadata?.name));
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, max-age=1800, stale-while-revalidate=3600');
  if (metadata?.size) headers.set('content-length', metadata.size);
  return new Response(null, { status: 200, headers });
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!(await canAccessLessonFile(id))) return NextResponse.json({ error: 'media_not_allowed' }, { status: 403 });
    const token = await getAccessToken().catch(() => null);
    const metadata = await getMetadata(id, token).catch(() => null);
    const parsed = parseRange(request.headers.get('range'), Number(metadata?.size || 0));
    const upstream = await fetchMedia(id, token, parsed?.header || request.headers.get('range'));
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      return NextResponse.json({ error: 'drive_video_unavailable', using_oauth: Boolean(token), status: upstream.status, detail: detail.slice(0, 300) }, { status: upstream.status || 500 });
    }
    const status = upstream.status === 206 || parsed ? 206 : upstream.status;
    return new Response(upstream.body, { status, headers: responseHeaders(upstream, metadata, parsed) });
  } catch (error) {
    return NextResponse.json({ error: 'drive_proxy_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
