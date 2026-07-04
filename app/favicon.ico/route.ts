import { NextResponse } from 'next/server';
import { getAdminSettings } from '@/lib/data/admin-settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await getAdminSettings();
  const b = settings.branding;
  const faviconUrl = String(b.faviconUrl || b.logoUrl || '').trim();
  if (faviconUrl && faviconUrl.startsWith('http')) {
    return NextResponse.redirect(faviconUrl, { status: 302 });
  }
  const letter = String(b.appName || 'F').trim().charAt(0).toUpperCase() || 'F';
  const color = String(b.primaryColor || '#D4AF37').replace('#', '%23');
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="%23050506"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="34" font-weight="900" fill="${color}">${letter}</text></svg>`;
  return new NextResponse(body, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
}
