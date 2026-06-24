import { NextResponse } from 'next/server';
import { updateBrandingSettings } from '@/lib/data/admin-settings';

export const dynamic = 'force-dynamic';

const ALLOWED_FIELDS = new Set(['logoUrl', 'faviconUrl', 'loginImageUrl', 'heroImageUrl', 'ogImageUrl', 'appName', 'primaryColor']);

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const body = payload?.branding && typeof payload.branding === 'object' ? payload.branding : payload;
    const branding: Record<string, string> = {};

    for (const [key, value] of Object.entries(body || {})) {
      if (ALLOWED_FIELDS.has(key) && typeof value === 'string') branding[key] = value;
    }

    if (!Object.keys(branding).length) {
      return NextResponse.json({ error: 'Nenhum campo válido de branding foi enviado.' }, { status: 400 });
    }

    const settings = await updateBrandingSettings(branding);
    return NextResponse.json({ ok: true, branding: settings.branding });
  } catch (error) {
    console.error('Falha ao salvar branding', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao salvar branding.' }, { status: 500 });
  }
}
