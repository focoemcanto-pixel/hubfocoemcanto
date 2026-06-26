import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createR2SignedPutUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_NAME_LENGTH = 180;

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null) as { fileName?: string; contentType?: string; folder?: string } | null;
    const fileName = String(body?.fileName || '').trim();
    const contentType = String(body?.contentType || 'application/octet-stream').trim() || 'application/octet-stream';
    const folder = String(body?.folder || '').trim() || undefined;

    if (!fileName || fileName.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: 'invalid_file_name' }, { status: 400 });
    }

    if (!/^(video|audio|image|application)\//i.test(contentType)) {
      return NextResponse.json({ error: 'invalid_content_type' }, { status: 400 });
    }

    const signed = await createR2SignedPutUrl({ fileName, contentType, folder });
    return NextResponse.json(signed);
  } catch (error) {
    return NextResponse.json({ error: 'r2_signed_upload_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
