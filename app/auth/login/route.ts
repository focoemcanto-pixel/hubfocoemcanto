import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPassword, isStrongEnough, verifyPassword } from '@/lib/auth/password';

function loginUrl(request: Request, params: Record<string, string>) {
  const url = new URL('/login', request.url);
  Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
  return url;
}

function redirectLogin(request: Request, params: Record<string, string>) {
  return NextResponse.redirect(loginUrl(request, params), { status: 303 });
}

async function getOrCreateProfile(email: string) {
  const supabase = createAdminClient();
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
  if (error) return { profile: null, error };
  if (profile) return { profile, error: null };
  const { data: created, error: createError } = await supabase
    .from('profiles')
    .insert({ email, name: email.split('@')[0], role: 'student' })
    .select('*')
    .maybeSingle();
  return { profile: created || null, error: createError };
}

function setSession(request: Request, email: string) {
  const response = NextResponse.redirect(new URL('/aluno', request.url), { status: 303 });
  response.cookies.set('hub_access_email', email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.url.startsWith('https://'),
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

function missingPasswordColumn(message?: string) {
  return !!message && (message.includes('schema cache') || message.includes('hub_password_hash') || message.includes('Could not find'));
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL('/aluno', request.url), { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const intent = String(formData.get('intent') || 'continue');
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm_password') || '');

  if (!email || !email.includes('@')) return redirectLogin(request, { erro: 'email' });

  const { profile, error } = await getOrCreateProfile(email);
  if (error || !profile?.id) return redirectLogin(request, { erro: 'perfil', email });

  const storedHash = String((profile as any).hub_password_hash || '');
  const supabase = createAdminClient();

  if (intent === 'set-password') {
    if (!isStrongEnough(password)) return redirectLogin(request, { setup: '1', email, erro: 'senha_curta' });
    if (password !== confirm) return redirectLogin(request, { setup: '1', email, erro: 'senha_diferente' });
    const nextHash = await hashPassword(password);
    const { error: updateError } = await supabase.from('profiles').update({ hub_password_hash: nextHash, updated_at: new Date().toISOString() }).eq('id', profile.id);
    if (updateError) {
      if (missingPasswordColumn(updateError.message)) return redirectLogin(request, { setup: '1', email, erro: 'schema_senha' });
      return redirectLogin(request, { setup: '1', email, erro: 'senha' });
    }
    return setSession(request, email);
  }

  if (!storedHash) return redirectLogin(request, { setup: '1', email });
  if (intent !== 'login') return redirectLogin(request, { password: '1', email });
  if (!password) return redirectLogin(request, { password: '1', email, erro: 'senha_obrigatoria' });
  const ok = await verifyPassword(password, storedHash);
  if (!ok) return redirectLogin(request, { password: '1', email, erro: 'senha_incorreta' });
  return setSession(request, email);
}
