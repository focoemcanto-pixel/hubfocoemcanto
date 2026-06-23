import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const formData = await request.formData();
  const id = String(formData.get('id') || '');
  if (!id) return NextResponse.redirect(new URL('/admin/alunos?error=id', request.url));

  const supabase = createAdminClient();
  await supabase.from('subscriptions').delete().eq('profile_id', id);
  await supabase.from('profiles').delete().eq('id', id);

  return NextResponse.redirect(new URL('/admin/alunos?removed=1', request.url));
}
