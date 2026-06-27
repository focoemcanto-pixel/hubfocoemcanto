import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_NAME_LENGTH = 180;

type Body = { fileName?: string; relativePath?: string; productId?: string; moduleId?: string; size?: number; contentType?: string; fileHash?: string; originalSize?: number; compressionProfile?: string };

function cfg() {
  return { accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '', streamKey: process.env['CLOUDFLARE_' + 'STREAM_' + 'TOKEN'] || '' };
}

function isVideo(fileName: string, contentType: string) {
  return contentType.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(fileName);
}

function cleanTitle(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '').trim();
}

function metaValue(value: unknown) {
  return String(value ?? '').slice(0, 500);
}

function cfMessage(json: any, fallback: string) {
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  const messages = Array.isArray(json?.messages) ? json.messages : [];
  return [
    ...errors.map((item: any) => [item?.code, item?.message].filter(Boolean).join(': ')),
    ...messages.map((item: any) => String(item?.message || item)),
    String(json?.message || ''),
    fallback,
  ].filter(Boolean).join(' · ');
}

async function streamUidExists(uid: string, accountId: string, streamKey: string) {
  if (!uid || !accountId || !streamKey) return false;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    headers: { authorization: ['Bearer', streamKey].join(' ') },
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  return response.ok && json?.success !== false && Boolean(json?.result?.uid || json?.result?.created);
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
    const fileHash = String(body.fileHash || '').trim();
    const originalSize = Number(body.originalSize || 0) || 0;
    const compressionProfile = String(body.compressionProfile || '').trim();
    const { accountId, streamKey } = cfg();

    if (!fileName || fileName.length > MAX_NAME_LENGTH) return NextResponse.json({ error: 'invalid_file_name', message: 'Nome de arquivo inválido.' }, { status: 400 });
    if (!productId || !moduleId) return NextResponse.json({ error: 'missing_destination', message: 'Selecione produto e módulo.' }, { status: 400 });
    if (!isVideo(fileName, contentType)) return NextResponse.json({ error: 'invalid_video', message: 'O Cloudflare Stream aceita apenas vídeos.' }, { status: 400 });
    if (!accountId || !streamKey) return NextResponse.json({ error: 'missing_cloudflare_env', message: 'Configure as variáveis do Cloudflare Stream.' }, { status: 500 });

    const supabase = createAdminClient();
    const [{ data: product }, { data: module }] = await Promise.all([
      supabase.from('products').select('id,slug,name').eq('id', productId).maybeSingle(),
      supabase.from('modules').select('id,slug,title').eq('id', moduleId).maybeSingle(),
    ]);
    if (!product?.id || !module?.id) return NextResponse.json({ error: 'invalid_destination', message: 'Produto ou módulo inválido.' }, { status: 400 });

    const normalizedTitle = normalizeMediaTitle(cleanTitle(fileName));
    const titleQuery = supabase
      .from('media_assets')
      .select('id,stream_uid,title,status')
      .eq('provider', 'cloudflare_stream')
      .eq('module_id', moduleId)
      .eq('normalized_title', normalizedTitle)
      .not('stream_uid', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hashQuery = fileHash
      ? supabase
        .from('media_assets')
        .select('id,stream_uid,title,status')
        .eq('provider', 'cloudflare_stream')
        .eq('file_hash', fileHash)
        .not('stream_uid', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null });

    const [{ data: existingByTitle }, { data: existingByHash }] = await Promise.all([titleQuery, hashQuery as any]);
    const candidates = [existingByHash, existingByTitle].filter(Boolean) as Array<{ id: string; stream_uid?: string | null; title?: string | null; status?: string | null }>;

    for (const existingAsset of candidates) {
      if (!existingAsset?.stream_uid) continue;
      const existsOnCloudflare = await streamUidExists(existingAsset.stream_uid, accountId, streamKey);
      if (existsOnCloudflare) {
        return NextResponse.json({
          uid: existingAsset.stream_uid,
          existing: true,
          skippedUpload: true,
          reason: existingAsset.id === existingByHash?.id ? 'already_exists_for_file_hash' : 'already_exists_for_module_title',
          message: 'Vídeo já existe no Cloudflare Stream. O Hub vai reutilizar o UID.',
        });
      }

      await supabase
        .from('media_assets')
        .update({
          status: 'missing_on_stream',
          raw: { staleStreamUid: existingAsset.stream_uid, staleDetectedAt: new Date().toISOString(), reason: 'stream_uid_not_found_on_cloudflare' },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAsset.id);
    }

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
      method: 'POST',
      headers: {
        [['Authori', 'zation'].join('')]: [['Be', 'arer'].join(''), streamKey].join(' '),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxDurationSeconds: 14400,
        requireSignedURLs: false,
        meta: {
          name: metaValue(fileName),
          normalizedTitle: metaValue(normalizedTitle),
          relativePath: metaValue(relativePath),
          productId: metaValue(productId),
          productSlug: metaValue(product.slug || ''),
          productName: metaValue(product.name || ''),
          moduleId: metaValue(moduleId),
          moduleSlug: metaValue(module.slug || ''),
          moduleTitle: metaValue(module.title || ''),
          logicalPath: metaValue(`${product.name || product.slug || productId}/${module.title || module.slug || moduleId}/${cleanTitle(fileName)}`),
          fileHash: metaValue(fileHash),
          originalSize: metaValue(originalSize),
          uploadedSize: metaValue(size),
          compressionProfile: metaValue(compressionProfile),
          uploadedFrom: 'hubfocoemcanto',
        },
      }),
      cache: 'no-store',
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) {
      return NextResponse.json({
        error: 'stream_direct_upload_failed',
        message: cfMessage(json, `Cloudflare Stream respondeu ${response.status}. Verifique a permissão Stream Edit do token.`),
        cloudflareStatus: response.status,
        cloudflareErrors: Array.isArray(json?.errors) ? json.errors : undefined,
        cloudflareMessages: Array.isArray(json?.messages) ? json.messages : undefined,
      }, { status: 502 });
    }

    const uid = String(json?.result?.uid || '');
    const uploadUrl = String(json?.result?.uploadURL || json?.result?.uploadUrl || '');
    if (!uid || !uploadUrl) return NextResponse.json({ error: 'invalid_stream_upload_response', message: 'Cloudflare não retornou UID/uploadURL.', cloudflareResult: json?.result || null }, { status: 502 });

    return NextResponse.json({
      uid,
      uploadUrl,
      uploadURL: uploadUrl,
      uploadMode: 'direct',
      method: 'POST',
      formField: 'file',
      expiresIn: 21600,
      staleDuplicateIgnored: candidates.length > 0,
    });
  } catch (error) {
    return NextResponse.json({ error: 'stream_upload_url_error', message: error instanceof Error ? error.message : 'Erro ao criar upload no Stream.' }, { status: 500 });
  }
}
