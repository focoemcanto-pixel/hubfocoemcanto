import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeMediaTitle, streamThumbnailUrl } from '@/lib/media/cloudflare-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cloudflareConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '';
  const token = process.env.CLOUDFLARE_STREAM_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '';
  return { accountId, token };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fileName = String(body.fileName || '').trim();
    const productId = String(body.productId || '').trim() || null;
    const relativePath = String(body.relativePath || fileName).trim();

    if (!fileName) return NextResponse.json({ error: 'missing_file_name' }, { status: 400 });
    const { accountId, token } = cloudflareConfig();
    if (!accountId || !token) return NextResponse.json({ error: 'stream_not_configured', message: 'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_STREAM_TOKEN.' }, { status: 500 });

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        maxDurationSeconds: 3600,
        meta: {
          name: fileName,
          productId: productId || '',
          relativePath,
          normalizedTitle: normalizeMediaTitle(fileName),
          source: 'hub_batch_upload',
        },
        requireSignedURLs: false,
      }),
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      return NextResponse.json({ error: 'stream_direct_upload_failed', detail: json?.errors || json }, { status: response.status || 500 });
    }

    const uid = String(json.result?.uid || '');
    const uploadURL = String(json.result?.uploadURL || '');
    if (!uid || !uploadURL) return NextResponse.json({ error: 'stream_uid_missing', detail: json }, { status: 500 });

    const supabase = createAdminClient();
    await supabase.from('media_assets').upsert({
      provider: 'cloudflare_stream',
      media_type: 'video',
      title: fileName,
      normalized_title: normalizeMediaTitle(fileName),
      product_id: productId,
      stream_uid: uid,
      thumbnail_url: streamThumbnailUrl(uid),
      status: 'upload_url_created',
      raw: { fileName, relativePath, directUpload: json.result },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stream_uid' }).then(() => null);

    return NextResponse.json({ uid, uploadURL, thumbnailUrl: streamThumbnailUrl(uid) });
  } catch (error) {
    return NextResponse.json({ error: 'stream_upload_url_error', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
