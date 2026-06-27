import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = { fileName?: string; relativePath?: string; productId?: string; moduleId?: string; size?: number; contentType?: string };
type CloudflareError = { code?: string | number; message?: string };

function config() {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    token: process.env.CLOUDFLARE_STREAM_TOKEN || '',
  };
}

function isVideo(fileName: string, contentType: string) {
  return contentType.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(fileName);
}

function metaValue(value: unknown) {
  return String(value ?? '').slice(0, 500);
}

function base64Metadata(value: unknown) {
  return Buffer.from(metaValue(value), 'utf8').toString('base64');
}

function uploadMetadata(values: Record<string, unknown>) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .map(([key, value]) => `${key} ${base64Metadata(value)}`)
    .join(',');
}

function cloudflareErrorMessage(json: any, fallback: string) {
  const errors = Array.isArray(json?.errors) ? json.errors as CloudflareError[] : [];
  const messages = Array.isArray(json?.messages) ? json.messages : [];
  const errorText = errors.map((item) => [item.code, item.message].filter(Boolean).join(': ')).filter(Boolean);
  const messageText = messages.map((item: any) => String(item?.message || item)).filter(Boolean);
  return [...errorText, ...messageText, String(json?.message || '').trim(), fallback].filter(Boolean).join(' · ');
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
    const contentType = String(body.contentType || 'video/mp4').trim() || 'video/mp4';
    const size = Number(body.size || 0) || 0;
    const { accountId, token } = config();

    if (!fileName) return NextResponse.json({ error: 'missing_file_name', message: 'Informe o nome do vídeo.' }, { status: 400 });
    if (!productId || !moduleId) return NextResponse.json({ error: 'missing_destination', message: 'Selecione produto e módulo.' }, { status: 400 });
    if (!isVideo(fileName, contentType)) return NextResponse.json({ error: 'invalid_video', message: 'O Cloudflare Stream aceita apenas vídeos.' }, { status: 400 });
    if (!size) return NextResponse.json({ error: 'missing_upload_length', message: 'Não foi possível identificar o tamanho do vídeo.' }, { status: 400 });
    if (!accountId || !token) return NextResponse.json({ error: 'missing_cloudflare_env', message: 'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.' }, { status: 500 });

    const supabase = createAdminClient();
    const [{ data: product }, { data: module }] = await Promise.all([
      supabase.from('products').select('id,slug,name').eq('id', productId).maybeSingle(),
      supabase.from('modules').select('id,slug,title').eq('id', moduleId).maybeSingle(),
    ]);
    if (!product?.id || !module?.id) return NextResponse.json({ error: 'invalid_destination', message: 'Produto ou módulo inválido.' }, { status: 400 });

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, {
      method: 'POST',
      headers: {
        authorization: ['Bearer', token].join(' '),
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(size),
        'Upload-Metadata': uploadMetadata({
          name: fileName,
          relativePath,
          productId,
          productSlug: product.slug || '',
          productName: product.name || '',
          moduleId,
          moduleSlug: module.slug || '',
          moduleTitle: module.title || '',
          uploadedFrom: 'hubfocoemcanto',
        }),
      },
      cache: 'no-store',
    });

    const location = response.headers.get('location') || response.headers.get('Location') || '';
    const text = await response.text().catch(() => '');
    let json: any = {};
    if (text) {
      try { json = JSON.parse(text); } catch { json = { message: text }; }
    }

    if (!response.ok || !location) {
      return NextResponse.json({
        error: 'stream_tus_upload_failed',
        message: cloudflareErrorMessage(json, `Cloudflare Stream respondeu ${response.status}. Verifique se CLOUDFLARE_STREAM_TOKEN tem permissão Stream Edit.`),
        cloudflareStatus: response.status,
        cloudflareErrors: Array.isArray(json?.errors) ? json.errors : undefined,
        cloudflareMessages: Array.isArray(json?.messages) ? json.messages : undefined,
      }, { status: 502 });
    }

    const uid = location.split('/').filter(Boolean).pop() || '';
    if (!uid) return NextResponse.json({ error: 'invalid_stream_upload_response', message: 'Cloudflare não retornou UID na URL TUS.', uploadUrl: location }, { status: 502 });

    return NextResponse.json({ uid, uploadUrl: location, uploadURL: location, uploadMode: 'tus', chunkSize: 8 * 1024 * 1024, expiresIn: 3600 });
  } catch (error) {
    return NextResponse.json({ error: 'stream_upload_url_error', message: error instanceof Error ? error.message : 'Erro ao criar upload no Stream.' }, { status: 500 });
  }
}
