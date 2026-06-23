import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const formData = await request.formData();
  const supabase = createAdminClient();
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const whatsapp = String(formData.get('whatsapp') || '').trim();
  const productName = String(formData.get('product_name') || '').trim();
  const status = String(formData.get('status') || 'active');

  if (!email && !whatsapp) return NextResponse.redirect(new URL('/admin/alunos?novo=1&error=contato', request.url));

  const { data: existing } = email ? await supabase.from('profiles').select('id').eq('email', email).maybeSingle() : { data: null } as any;
  const profileId = existing?.id || crypto.randomUUID();

  if (existing?.id) {
    await supabase.from('profiles').update({ name, whatsapp, role: 'student', updated_at: new Date().toISOString() }).eq('id', profileId);
  } else {
    await supabase.from('profiles').insert({ id: profileId, name, email: email || null, whatsapp, role: 'student' });
  }

  if (productName) await supabase.from('subscriptions').insert({ profile_id: profileId, status, product_name: productName });

  return NextResponse.redirect(new URL('/admin/alunos?saved=1', request.url));
}
