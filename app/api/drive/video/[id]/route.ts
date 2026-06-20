import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'edge';

type Params = { params: Promise<{ id: string }> };

async function getAccessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase.from('google_drive_connections').select('*').eq('id', 'default').maybeSingle();
  return data?.access_token as string | undefined;
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const token = await getAccessToken();

  if (!token || !id) {
    return NextResponse.json({ error: 'drive_not_connected' }, { status: 401 });
  }

  const range = request.headers.get('range') || undefined;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: {
      authorization: `Bearer ${token}`,
      ...(range ? { range } : {}),
    },
  });

  if (!response.ok || !response.body) {
    return NextResponse.json({ error: 'drive_video_unavailable' }, { status: response.status || 500 });
  }

  const headers = new Headers();
  headers.set('content-type', response.headers.get('content-type') || 'video/mp4');
  headers.set('accept-ranges', response.headers.get('accept-ranges') || 'bytes');
  headers.set('cache-control', 'private, max-age=120');
  headers.set('cross-origin-resource-policy', 'same-origin');
  const contentLength = response.headers.get('content-length');
  const contentRange = response.headers.get('content-range');
  if (contentLength) headers.set('content-length', contentLength);
  if (contentRange) headers.set('content-range', contentRange);

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
