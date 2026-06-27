import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = { fileName?: string; relativePath?: string; productId?: string; moduleId?: string; size?: number; contentType?: string };

function config() {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    token: process.env.CLOUDFLARE_STREAM_TOKEN || '',
  };
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as Body;
    const fileName = String(body.fileName || '').trim();
    const relativePath = String(body.relativePath || fileName).trim();
    const productId = String(body.productId || '').trim();
    const moduleId = String(body.moduleId || '').trim();
    const { accountId, token } = config();

    if (!fileName) return NextResponse.json({ error: 'missing_file_name', message: 'Informe o nome do vídeo.' }, { status: 400 });
    if (!productId || !moduleId) return NextResponse.json({ error: 'missing_destination', message: 'Selecione produto e módulo.' }, { status: 400 });
    if (!accountId || !token) return NextResponse.json({ error: 'missing_cloudflare_env', message: 'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.' }, { status: 500 });

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
      method: 'POST',
      headers: {
        authorization: ['Bearer', token].join(' '),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        maxDurationSeconds: 3600,
        meta: {
          name: fileName,
          relativePath,
          productId,
          moduleId,
          uploadedFrom: 'hubfocoemcanto',
        },
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) {
      return NextResponse.json({ error: 'stream_direct_upload_failed', message: json?.errors?.[0]?.message || `Cloudflare Stream respondeu ${response.status}.` }, { status: 502 });
    }

    const uid = String(json?.result?.uid || '');
    const uploadUrl = String(json?.result?.uploadURL || json?.result?.uploadUrl || '');
    if (!uid || !uploadUrl) return NextResponse.json({ error: 'invalid_stream_upload_response', message: 'Cloudflare não retornou UID/uploadURL.' }, { status: 502 });

    return NextResponse.json({ uid, uploadUrl, uploadURL: uploadUrl, expiresIn: 3600 });
  } catch (error) {
    return NextResponse.json({ error: 'stream_upload_url_error', message: error instanceof Error ? error.message : 'Erro ao criar upload no Stream.' }, { status: 500 });
  }
}
