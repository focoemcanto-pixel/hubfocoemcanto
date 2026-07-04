import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createResetToken, hashResetToken, resetExpiresAt } from '@/lib/auth/reset-token';
import { sendPasswordResetEmail } from '@/lib/email/password-reset-email';

function recoveryUrl(request: Request, params: Record<string, string>) {
  const url = new URL('/recuperar-senha', request.url);
  Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
  return url;
}

function redirectRecovery(request: Request, params: Record<string, string>) {
  return NextResponse.redirect(recoveryUrl(request, params), { status: 303 });
}

function missingResetColumns(message?: string | null) {
  const text = String(message || '').toLowerCase();
  return text.includes('schema cache') || text.includes('password_reset') || text.includes('could not find');
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  if (!email || !email.includes('@')) return redirectRecovery(request, { erro: 'email' });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('id,email').eq('email', email).maybeSingle();

  if (!profile?.id) return redirectRecovery(request, { sent: '1', email });

  const token = createResetToken();
  const tokenHash = await hashResetToken(token);
  const { error } = await supabase
    .from('profiles')
    .update({
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: resetExpiresAt(45),
      password_reset_requested_at: new Date().toISOString(),
      password_reset_used_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id);

  if (error) return redirectRecovery(request, { erro: missingResetColumns(error.message) ? 'schema' : 'envio', email });

  const resetUrl = new URL('/recuperar-senha', request.url);
  resetUrl.searchParams.set('email', email);
  resetUrl.searchParams.set('token', token);
  const sent = await sendPasswordResetEmail(email, resetUrl.toString());

  if (!sent.ok) return redirectRecovery(request, { erro: 'envio', email });
  return redirectRecovery(request, { sent: '1', email });
}
