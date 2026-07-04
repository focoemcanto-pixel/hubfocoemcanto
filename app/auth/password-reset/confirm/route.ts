import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPassword, isStrongEnough } from '@/lib/auth/password';
import { hashResetToken } from '@/lib/auth/reset-token';

function recoveryUrl(request: Request, params: Record<string, string>) {
  const url = new URL('/recuperar-senha', request.url);
  Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
  return url;
}

function redirectRecovery(request: Request, params: Record<string, string>) {
  return NextResponse.redirect(recoveryUrl(request, params), { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const token = String(formData.get('token') || '').trim();
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm_password') || '');

  if (!email || !email.includes('@')) return redirectRecovery(request, { erro: 'email' });
  if (!token) return redirectRecovery(request, { erro: 'invalido', email });
  if (!isStrongEnough(password)) return redirectRecovery(request, { erro: 'senha_curta', email, token });
  if (password !== confirm) return redirectRecovery(request, { erro: 'senha_diferente', email, token });

  const supabase = createAdminClient();
  const tokenHash = await hashResetToken(token);
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id,email,password_reset_token_hash,password_reset_expires_at,password_reset_used_at')
    .eq('email', email)
    .maybeSingle();

  if (error || !profile?.id) return redirectRecovery(request, { erro: 'invalido', email });
  if (profile.password_reset_used_at) return redirectRecovery(request, { erro: 'invalido', email });
  if (String(profile.password_reset_token_hash || '') !== tokenHash) return redirectRecovery(request, { erro: 'invalido', email });
  if (!profile.password_reset_expires_at || new Date(profile.password_reset_expires_at).getTime() < Date.now()) return redirectRecovery(request, { erro: 'expirado', email });

  const nextHash = await hashPassword(password);
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      hub_password_hash: nextHash,
      password_reset_token_hash: null,
      password_reset_expires_at: null,
      password_reset_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id);

  if (updateError) return redirectRecovery(request, { erro: 'invalido', email });
  return redirectRecovery(request, { ok: '1', email });
}
