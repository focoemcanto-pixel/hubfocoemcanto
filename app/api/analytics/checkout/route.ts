import { NextResponse } from 'next/server';
import { trackAnalyticsEvent } from '@/lib/analytics/server';

export const dynamic = 'force-dynamic';

const DEFAULT_VIP_CHECKOUT = 'https://pay.kiwify.com.br/HHr4eyM';

function safeRedirect(value: string | null) {
  if (!value) return DEFAULT_VIP_CHECKOUT;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return DEFAULT_VIP_CHECKOUT;
    return url.toString();
  } catch {
    return DEFAULT_VIP_CHECKOUT;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const product = url.searchParams.get('product') || 'grupo-vip';
  const source = url.searchParams.get('source') || 'hub';
  const screen = url.searchParams.get('screen') || 'unknown';
  const blocked = url.searchParams.get('blocked') !== '0';
  const redirect = safeRedirect(url.searchParams.get('redirect') || process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || DEFAULT_VIP_CHECKOUT);
  if (blocked) await trackAnalyticsEvent({ event: 'premium_block', product, source, screen, metadata: { redirect } });
  await trackAnalyticsEvent({ event: 'checkout_open', product, source, screen, metadata: { redirect } });
  return NextResponse.redirect(redirect);
}
