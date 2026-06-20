import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, subscriptions(status)')
    .eq('email', email)
    .maybeSingle();

  const subscriptions = Array.isArray(profile?.subscriptions) ? profile?.subscriptions : [];
  const isActive = subscriptions.some((subscription) => subscription.status === 'active');

  if (!profile || !isActive) {
    redirect('/login?erro=acesso-inativo');
  }

  const origin = new URL(request.url).origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) redirect('/login?erro=magic-link');
  redirect('/login/enviado');
}
