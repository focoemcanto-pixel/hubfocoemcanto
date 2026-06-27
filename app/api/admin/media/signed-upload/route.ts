import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createR2SignedPutUrl } from '@/lib/r2';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_NAME_LENGTH = 180;
const ALLOWED_MEDIA_TYPES = new Set(['audio', 'image', 'file']);

type Body = { fileName?: string; contentType?: string; folder?: string; productId?: string; moduleId?: string; relativePath?: string; mediaType?: string; auxiliaryVideo?: boolean };

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null) as Body | null;
    const fileName = String(body?.fileName || '').trim();
    const contentType = String(body?.contentType || 'application/octet-stream').trim() || 'application/octet-stream';
    const folder = String(body?.folder || '').trim() || undefined;
    const productId = String(body?.productId || '').trim();
    const moduleId = String(body?.moduleId || '').trim();
    const relativePath = String(body?.relativePath || '').trim();
    const mediaType = String(body?.mediaType || '').trim();

    if (!fileName || fileName.length > MAX_NAME_LENGTH) return NextResponse.json({ error: 'invalid_file_name' }, { status: 400 });
    if (!contentType.includes('/')) return NextResponse.json({ error: 'invalid_content_type' }, { status: 400 });
    if (contentType === 'video/mp4' && !body?.auxiliaryVideo) return NextResponse.json({ error: 'main_video_not_allowed', message: 'Vídeos principais devem ir para o Cloudflare Stream. Use R2 apenas para áudios, capas e arquivos auxiliares.' }, { status: 400 });

    if (productId || moduleId || mediaType || relativePath) {
      if (!productId) return NextResponse.json({ error: 'missing_product_id', message: 'Informe o produto.' }, { status: 400 });
      if (!moduleId) return NextResponse.json({ error: 'missing_module_id', message: 'Selecione o módulo de destino.' }, { status: 400 });
      if (!ALLOWED_MEDIA_TYPES.has(mediaType)) return NextResponse.json({ error: 'invalid_media_type', message: 'Tipo de mídia inválido para R2.' }, { status: 400 });
      const supabase = createAdminClient();
      const [{ data: product }, { data: module }] = await Promise.all([
        supabase.from('products').select('id,slug').eq('id', productId).maybeSingle(),
        supabase.from('modules').select('id,slug').eq('id', moduleId).maybeSingle(),
      ]);
      if (!product?.id || !module?.id) return NextResponse.json({ error: 'invalid_destination', message: 'Produto ou módulo inválido.' }, { status: 400 });
      const signed = await createR2SignedPutUrl({ fileName, contentType, productId, productSlug: product.slug, moduleId, moduleSlug: module.slug, relativePath, mediaType });
      return NextResponse.json(signed);
    }

    const signed = await createR2SignedPutUrl({ fileName, contentType, folder });
    return NextResponse.json(signed);
  } catch (error) {
    return NextResponse.json({ error: 'r2_signed_upload_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
