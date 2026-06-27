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
    const relativePath = String(body?.relativePath || '').trim();
    const size = Number(body?.size || 0) || null;

    if (!fileName || fileName.length > MAX_NAME_LENGTH) return NextResponse.json({ error: 'invalid_file_name', message: 'Nome de arquivo inválido.' }, { status: 400 });
    if (!isVideo(fileName, contentType)) return NextResponse.json({ error: 'invalid_video', message: 'O Cloudflare Stream deve receber apenas vídeos.' }, { status: 400 });
    if (!productId) return NextResponse.json({ error: 'missing_product_id', message: 'Informe o produto.' }, { status: 400 });
    if (!moduleId) return NextResponse.json({ error: 'missing_module_id', message: 'Selecione o módulo de destino.' }, { status: 400 });

    const supabase = createAdminClient();
    const [{ data: product }, { data: module }] = await Promise.all([
      supabase.from('products').select('id,slug,name').eq('id', productId).maybeSingle(),
      supabase.from('modules').select('id,slug,title').eq('id', moduleId).maybeSingle(),
    ]);
    if (!product?.id || !module?.id) return NextResponse.json({ error: 'invalid_destination', message: 'Produto ou módulo inválido.' }, { status: 400 });

    const { accountId, token } = streamConfig();
    if (!accountId || !token) return NextResponse.json({ error: 'stream_not_configured', message: 'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.' }, { status: 500 });

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maxDurationSeconds: 14400,
        requireSignedURLs: false,
        meta: {
          name: fileName,
          productId,
          productSlug: product.slug || '',
          productName: product.name || '',
          moduleId,
          moduleSlug: module.slug || '',
          moduleTitle: module.title || '',
          relativePath,
          size,
          source: 'hubfocoemcanto-admin',
        },
      }),
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) throw new Error(json?.errors?.[0]?.message || `Cloudflare Stream respondeu ${response.status}.`);

    return NextResponse.json({ uid: json?.result?.uid, uploadUrl: json?.result?.uploadURL, expiresIn: 60 * 60 * 6 });
  } catch (error) {
    return NextResponse.json({ error: 'stream_upload_url_failed', message: error instanceof Error ? error.message : 'Não foi possível preparar o upload para o Stream.' }, { status: 500 });
  }
}
