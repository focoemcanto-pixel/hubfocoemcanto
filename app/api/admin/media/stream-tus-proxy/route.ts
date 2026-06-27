import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function targetFrom(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get('target') || '';
  try {
    const decoded = decodeURIComponent(target);
    const parsed = new URL(decoded);
    if (!['https:'].includes(parsed.protocol)) return '';
    if (!parsed.hostname.endsWith('cloudflare.com') && !parsed.hostname.endsWith('videodelivery.net')) return '';
    return decoded;
  } catch {
    return '';
  }
}

async function authorized() {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get('hub_access_email')?.value);
}

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Tus-Resumable,Upload-Offset,Content-Type',
    'Access-Control-Expose-Headers': 'Upload-Offset,Tus-Resumable',
    ...extra,
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function HEAD(request: Request) {
  if (!await authorized()) return new Response(null, { status: 401, headers: corsHeaders() });
  const target = targetFrom(request);
  if (!target) return new Response(null, { status: 400, headers: corsHeaders() });
  const response = await fetch(target, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' }, cache: 'no-store' });
  return new Response(null, {
    status: response.status,
    headers: corsHeaders({
      'Tus-Resumable': response.headers.get('Tus-Resumable') || '1.0.0',
      'Upload-Offset': response.headers.get('Upload-Offset') || '0',
    }),
  });
}

export async function PATCH(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders() });
  const target = targetFrom(request);
  if (!target) return NextResponse.json({ error: 'invalid_target' }, { status: 400, headers: corsHeaders() });
  const offset = request.headers.get('Upload-Offset') || '0';
  const body = await request.arrayBuffer();
  const response = await fetch(target, {
    method: 'PATCH',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Offset': offset,
      'Content-Type': 'application/offset+octet-stream',
    },
    body,
    cache: 'no-store',
  });
  const text = await response.text().catch(() => '');
  return new Response(text, {
    status: response.status,
    headers: corsHeaders({
      'Tus-Resumable': response.headers.get('Tus-Resumable') || '1.0.0',
      'Upload-Offset': response.headers.get('Upload-Offset') || offset,
    }),
  });
}
