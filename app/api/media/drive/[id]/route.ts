import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCESS_CACHE_MS = 55 * 60 * 1000;
const LESSON_ACCESS_CACHE_MS = 5 * 60 * 1000;
const METADATA_CACHE_MS = 30 * 60 * 1000;
const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const allowedFileCache = new Map<string, number>();
const driveMetadataCache = new Map<string, { metadata: DriveMetadata | null; expiresAt: number }>();
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

type DriveMetadata = {
  mimeType?: string | null;
  size?: string | null;
  name?: string | null;
};

type ParsedRange = {
  start: number;
  end: number;
  size: number;
  header: string;
  contentLength: number;
};

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function inferMediaContentType(metadata?: DriveMetadata | null, upstream?: Response | null) {
  const metadataType = String(metadata?.mimeType || '').trim().toLowerCase();
  if (metadataType && metadataType !== 'application/octet-stream') return metadataType;

  const upstreamType = String(upstream?.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (upstreamType && upstreamType !== 'application/octet-stream' && upstreamType !== 'binary/octet-stream') return upstreamType;

  const name = String(metadata?.name || '').toLowerCase();
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.m4a') || name.endsWith('.aac')) return 'audio/mp4';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.ogg') || name.endsWith('.oga')) return 'audio/ogg';

  return 'video/mp4';
}

function parseRange(rangeHeader: string | null, size: number): ParsedRange | null {
  if (!Number.isFinite(size) || size <= 0) return null;
  const fallbackEnd = Math.min(size - 1, DEFAULT_CHUNK_SIZE - 1);
  if (!rangeHeader) {
    return { start: 0, end: fallbackEnd, size, header: `bytes=0-${fallbackEnd}`, contentLength: fallbackEnd + 1 };
  }

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/i);
  if (!match) return null;

  let start: number;
  let end: number;
  const rawStart = match[1];
  const rawEnd = match[2];

  if (!rawStart && rawEnd) {
    const suffixLength = Math.max(0, Number(rawEnd));
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart || 0);
    end = rawEnd ? Number(rawEnd) : Math.min(size - 1, start + DEFAULT_CHUNK_SIZE - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
  end = Math.min(end, size - 1);
  return { start, end, size, header: `bytes=${start}-${end}`, contentLength: end - start + 1 };
}

function notSatisfiableHeaders(size: number, metadata?: DriveMetadata | null) {
  const headers = new Headers();
  headers.set('content-range', `bytes */${size || '*'}`);
  headers.set('accept-ranges', 'bytes');
  headers.set('content-type', inferMediaContentType(metadata));
  return headers;
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

async function getDriveMetadata(fileId: string, access: string): Promise<DriveMetadata | null> {
  const cached = driveMetadataCache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) return cached.metadata;

  const params = new URLSearchParams({
    fields: 'name,mimeType,size',
    supportsAllDrives: 'true',
  });

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, {
    headers: { authorization: `Bearer ${access}` },
    cache: 'no-store',
  });

  if (!response.ok) return null;
  const metadata = await response.json() as DriveMetadata;
  driveMetadataCache.set(fileId, { metadata, expiresAt: Date.now() + METADATA_CACHE_MS });
  return metadata;
}

function mediaHeaders(upstream: Response, metadata: DriveMetadata | null | undefined, range: ParsedRange | null) {
  const headers = new Headers();
  const contentType = inferMediaContentType(metadata, upstream);

  headers.set('content-type', contentType);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, max-age=1800, stale-while-revalidate=3600');
  headers.set('x-content-type-options', 'nosniff');
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

async function fetchDriveMedia(fileId: string, access: string, range: ParsedRange | null) {
  const headers: Record<string, string> = { authorization: `Bearer ${access}` };
  if (range) headers.range = range.header;

  return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers,
    cache: 'no-store',
  });
}

async function authorizeAndLoad(fileId: string) {
  const allowed = await canAccessLessonFile(fileId);
  if (!allowed) return { error: NextResponse.json({ error: 'media_not_allowed' }, { status: 403 }) };

  const access = await loadAccess();
  if (!access) return { error: NextResponse.json({ error: 'drive_not_connected' }, { status: 401 }) };

  return { access };
}

export async function HEAD(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await authorizeAndLoad(id);
    if ('error' in auth) return auth.error;

    const metadata = await getDriveMetadata(id, auth.access);
    const headers = new Headers();
    headers.set('content-type', inferMediaContentType(metadata));
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'private, max-age=1800, stale-while-revalidate=3600');
    headers.set('content-disposition', 'inline');
    headers.set('x-content-type-options', 'nosniff');
    if (metadata?.size) headers.set('content-length', metadata.size);

    return new Response(null, { status: 200, headers });
  } catch (error) {
    return NextResponse.json({ error: 'drive_proxy_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await authorizeAndLoad(id);
    if ('error' in auth) return auth.error;

    const metadata = await getDriveMetadata(id, auth.access);
    const size = Number(metadata?.size || 0);
    const requestedRange = request.headers.get('range');
    const forceFull = new URL(request.url).searchParams.get('full') === '1';
    const range = forceFull ? null : parseRange(requestedRange, size);

    if (!forceFull && (requestedRange || size > 0) && !range) {
      return new Response(null, { status: 416, headers: notSatisfiableHeaders(size, metadata) });
    }

    const upstream = await fetchDriveMedia(id, auth.access, range);

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      return NextResponse.json({ error: 'drive_video_unavailable', status: upstream.status, detail: detail.slice(0, 300) }, { status: upstream.status || 500 });
    }

    const status = range ? 206 : upstream.status;
    return new Response(upstream.body, { status, headers: mediaHeaders(upstream, metadata, range) });
  } catch (error) {
    return NextResponse.json({ error: 'drive_proxy_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
