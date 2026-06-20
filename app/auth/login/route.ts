import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirect('/login?erro=login');
  redirect('/aluno');
}
