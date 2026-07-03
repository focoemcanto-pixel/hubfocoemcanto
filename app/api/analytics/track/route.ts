import { NextResponse } from 'next/server';
import { trackAnalyticsEvent } from '@/lib/analytics/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const data = await request.json().catch(() => ({}));
  await trackAnalyticsEvent({
    event: String(data.name || data.event || ''),
    screen: String(data.screen || '') || null,
    product: String(data.product || '') || null,
    source: String(data.source || '') || null,
    metadata: typeof data.metadata === 'object' && data.metadata ? data.metadata : {},
  });
  return NextResponse.json({ ok: true });
}
