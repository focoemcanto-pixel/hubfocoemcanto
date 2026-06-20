import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const name = String(formData.get('name') || '');
  const email = String(formData.get('email') || '').toLowerCase();
  const whatsapp = String(formData.get('whatsapp') || '');
  const password = String(formData.get('password') || '');
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, whatsapp } },
  });

  if (error) redirect('/cadastro?erro=cadastro');

  if (data.user) {
    await supabase.from('profiles').upsert(
      { auth_user_id: data.user.id, name, email, whatsapp },
      { onConflict: 'email' }
    );
  }

  redirect('/aluno');
}
