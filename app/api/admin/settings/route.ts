import { NextResponse } from 'next/server';
import { saveAdminSettings } from '@/lib/data/admin-settings';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    await saveAdminSettings(payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Falha ao salvar configurações via API', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao salvar configurações.' }, { status: 500 });
  }
}
