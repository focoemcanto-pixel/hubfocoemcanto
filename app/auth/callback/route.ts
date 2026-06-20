import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const supabase = await createClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (user?.email) {
    await supabase
      .from('profiles')
      .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
      .eq('email', user.email.toLowerCase());
  }

  redirect('/aluno');
}
