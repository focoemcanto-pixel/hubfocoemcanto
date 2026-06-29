import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const uid = String(searchParams.get('uid') || '').trim();
    const expectedDuration = Number(searchParams.get('expectedDuration') || 0) || 0;
    if (!uid) return NextResponse.json({ error: 'missing_uid', message: 'UID obrigatório.' }, { status: 400 });

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
    const token = process.env.CLOUDFLARE_STREAM_TOKEN || '';
    if (!accountId || !token) return NextResponse.json({ error: 'missing_cloudflare_env', message: 'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.' }, { status: 500 });

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
      headers: { authorization: ['Bearer', token].join(' ') },
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) {
      return NextResponse.json({
        error: 'stream_status_failed',
        message: Array.isArray(json?.errors) && json.errors[0]?.message ? json.errors[0].message : `Cloudflare respondeu ${response.status}.`,
        cloudflareStatus: response.status,
      }, { status: response.status === 404 ? 404 : 502 });
    }

    const video = json?.result || {};
    const state = String(video?.status?.state || 'unknown');
    const duration = Number(video?.duration || 0) || null;
    const ratio = expectedDuration && duration ? duration / expectedDuration : null;
    const isComplete = !expectedDuration || Boolean(duration && duration >= expectedDuration * 0.95);
    const ready = state === 'ready' && Boolean(duration && duration > 0) && isComplete;

    return NextResponse.json({ uid, state, ready, received: ready, duration, expectedDuration: expectedDuration || null, ratio, isComplete, thumbnail: String(video?.thumbnail || ''), meta: video?.meta || {}, status: video?.status || {} });
  } catch (error) {
    return NextResponse.json({ error: 'stream_status_error', message: error instanceof Error ? error.message : 'Erro ao consultar status do Stream.' }, { status: 500 });
  }
}
