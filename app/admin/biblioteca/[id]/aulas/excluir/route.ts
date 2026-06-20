import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  const ids = formData.getAll('lesson_id').map(String).filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?aviso=selecione-aulas`, request.url));
  }

  const supabase = createAdminClient();
  await supabase.from('exercises').delete().eq('module_id', id).in('id', ids);

  return NextResponse.redirect(new URL(`/admin/biblioteca/${id}?sucesso=aulas-excluidas&total=${ids.length}`, request.url));
}
