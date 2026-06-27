import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_NAME_LENGTH = 180;

type Body = { fileName?: string; contentType?: string; productId?: string; moduleId?: string; relativePath?: string; size?: number };

function streamConfig() {
  return { accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '', token: process.env.CLOUDFLARE_STREAM_TOKEN || '' };
}

function isVideo(fileName: string, contentType: string) {
  return contentType.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(fileName);
}

function b64(value: string | number | null | undefined) {
  return Buffer.from(String(value ?? ''), 'utf8').toString('base64');
}

function metaValue(value: unknown) {
  return String(value ?? '').slice(0, 500);
}

function mediaIdFromLocation(location: string) {
  const match = location.match(/\/media\/([^/?#]+)/i) || location.match(/\/stream\/([^/?#]+)/i);
  return match?.[1] || '';
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null) as Body | null;
    const fileName = String(body?.fileName || '').trim();
    const contentType = String(body?.contentType || 'video/mp4').trim() || 'video/mp4';
    const productId = String(body?.productId || '').trim();
    const moduleId = String(body?.moduleId || '').trim();
    const relativePath = String(body?.relativePath || fileName).trim();
    const size = Number(body?.size || 0) || 0;

    if (!fileName || fileName.length > MAX_NAME_LENGTH) return NextResponse.json({ error: 'invalid_file_name', message: 'Nome de arquivo inválido.' }, { status: 400 });
    if (!isVideo(fileName, contentType)) return NextResponse.json({ error: 'invalid_video', message: 'O Cloudflare Stream deve receber apenas vídeos.' }, { status: 400 });
    if (!productId) return NextResponse.json({ error: 'missing_product_id', message: 'Informe o produto.' }, { status: 400 });
    if (!moduleId) return NextResponse.json({ error: 'missing_module_id', message: 'Selecione o módulo de destino.' }, { status: 400 });
    if (!size) return NextResponse.json({ error: 'missing_size', message: 'Não foi possível detectar o tamanho do vídeo.' }, { status: 400 });

    const supabase = createAdminClient();
    const [{ data: product }, { data: module }] = await Promise.all([
      supabase.from('products').select('id,slug,name').eq('id', productId).maybeSingle(),
      supabase.from('modules').select('id,slug,title').eq('id', moduleId).maybeSingle(),
    ]);
    if (!product?.id || !module?.id) return NextResponse.json({ error: 'invalid_destination', message: 'Produto ou módulo inválido.' }, { status: 400 });

    const { accountId, token } = streamConfig();
    if (!accountId || !token) return NextResponse.json({ error: 'stream_not_configured', message: 'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.' }, { status: 500 });

    const expiry = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const uploadMetadata = [
      `name ${b64(fileName)}`,
      `filename ${b64(fileName)}`,
      `filetype ${b64(contentType)}`,
      `maxDurationSeconds ${b64('14400')}`,
      `expiry ${b64(expiry)}`,
      `requiresignedurls ${b64('false')}`,
      `productId ${b64(metaValue(productId))}`,
      `productName ${b64(metaValue(product.name))}`,
      `moduleId ${b64(metaValue(moduleId))}`,
      `moduleTitle ${b64(metaValue(module.title))}`,
      `relativePath ${b64(metaValue(relativePath))}`,
      `source ${b64('hubfocoemcanto-tus-proxy')}`,
    ].join(',');

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?direct_user=true`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(size),
        'Upload-Metadata': uploadMetadata,
      },
      cache: 'no-store',
    });
    const text = await response.text().catch(() => '');
    const uploadUrl = response.headers.get('Location') || '';
    const uid = response.headers.get('stream-media-id') || mediaIdFromLocation(uploadUrl);

    if (!response.ok || !uploadUrl) {
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      const details = Array.isArray(parsed?.errors) ? parsed.errors.map((item: any) => item?.message || item?.code).filter(Boolean).join(' · ') : text;
      return NextResponse.json({ error: 'stream_tus_create_failed', message: details || `Cloudflare Stream respondeu ${response.status}.`, cloudflareStatus: response.status }, { status: 500 });
    }

    return NextResponse.json({ uid, uploadUrl, offset: Number(response.headers.get('Upload-Offset') || 0), chunkSize: 6 * 1024 * 1024 });
  } catch (error) {
    return NextResponse.json({ error: 'stream_tus_create_failed', message: error instanceof Error ? error.message : 'Não foi possível iniciar upload TUS do Stream.' }, { status: 500 });
  }
}
