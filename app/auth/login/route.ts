import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function isValidActiveSubscription(subscription: any) {
  const status = String(subscription?.status || '').toLowerCase();
  return status === 'active';
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email, subscriptions(status,current_period_end)')
    .eq('email', email)
    .maybeSingle();

  const subscriptions = Array.isArray(profile?.subscriptions) ? profile?.subscriptions : [];
  const isActive = subscriptions.some(isValidActiveSubscription);

  if (!profile) {
    return NextResponse.redirect(new URL('/acesso-bloqueado?motivo=nao-encontrado', request.url));
  }

  if (!isActive) {
    return NextResponse.redirect(new URL('/acesso-bloqueado?motivo=inativo', request.url));
  }

  const response = NextResponse.redirect(new URL('/aluno', request.url));
  response.cookies.set('hub_access_email', email);
  return response;
}
