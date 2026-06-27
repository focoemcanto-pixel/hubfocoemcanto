import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function streamToken() {
  return process.env.CLOUDFLARE_STREAM_TOKEN || '';
}

function validUploadUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname.endsWith('cloudflare.com') || url.hostname.endsWith('videodelivery.net'));
  } catch {
    return false;
  }
}

export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const uploadUrl = request.headers.get('x-stream-upload-url') || '';
    const offset = request.headers.get('upload-offset') || '0';
    const token = streamToken();
    if (!token) return NextResponse.json({ error: 'stream_not_configured', message: 'Configure CLOUDFLARE_STREAM_TOKEN.' }, { status: 500 });
    if (!uploadUrl || !validUploadUrl(uploadUrl)) return NextResponse.json({ error: 'invalid_upload_url', message: 'URL de upload TUS inválida.' }, { status: 400 });

    const body = await request.arrayBuffer();
    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': offset,
        'Content-Type': 'application/offset+octet-stream',
      },
      body,
      cache: 'no-store',
    });
    const text = await response.text().catch(() => '');
    const nextOffset = response.headers.get('Upload-Offset') || '';

    if (!response.ok) {
      return NextResponse.json({ error: 'stream_tus_patch_failed', message: text || `Cloudflare Stream respondeu ${response.status}.`, cloudflareStatus: response.status, nextOffset }, { status: 500 });
    }

    return NextResponse.json({ offset: Number(nextOffset || 0) });
  } catch (error) {
    return NextResponse.json({ error: 'stream_tus_patch_failed', message: error instanceof Error ? error.message : 'Não foi possível enviar chunk para o Stream.' }, { status: 500 });
  }
}
