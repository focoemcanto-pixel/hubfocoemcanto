import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('modules')
    .update({ is_active: false, sort_order: 9999 })
    .eq('id', id);

  if (error) {
    return NextResponse.redirect(new URL(`/admin/biblioteca?erro=${encodeURIComponent(error.message)}`, request.url), { status: 303 });
  }

  return NextResponse.redirect(new URL('/admin/biblioteca?sucesso=modulo_removido', request.url), { status: 303 });
}
