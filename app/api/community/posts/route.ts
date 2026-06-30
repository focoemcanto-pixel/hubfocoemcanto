import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const PRIVATE_TEST_ACCOUNT = 'markuezemarquinhos@hotmail.com';

function isAdminEmail(email?: string | null) {
  return String(email || '').trim().toLowerCase() === PRIVATE_TEST_ACCOUNT;
}

function isBlockedCourseUrl(url: string) {
  const value = url.toLowerCase();
  if (!value) return false;
  return value.includes('drive.google.com') || value.includes('googleusercontent.com') || value.includes('/api/media/drive/');
}

async function currentProfile() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  if (!email) return null;

  const supabase = createAdminClient();
  const { data } = await supabase.from('profiles').select('id,name,email').eq('email', email).maybeSingle();
  if (data) return data;

  const { data: created } = await supabase.from('profiles').insert({ email, name: email.split('@')[0], role: 'student' }).select('id,name,email').single();
  return created || null;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const caption = String(formData.get('caption') || '').trim();
  const media_url = String(formData.get('media_url') || '').trim();
  const exercise_id = String(formData.get('exercise_id') || '').trim() || null;

  if (!caption && !media_url) return NextResponse.redirect(new URL('/aluno/comunidade?erro=post-vazio', request.url));
  if (isBlockedCourseUrl(media_url)) return NextResponse.redirect(new URL('/aluno/comunidade?erro=midia-protegida', request.url));

  const profile = await currentProfile();
  if (!profile) return NextResponse.redirect(new URL('/aluno/comunidade?erro=perfil', request.url));

  const supabase = createAdminClient();
  const { error } = await supabase.from('community_posts').insert({
    profile_id: profile.id,
    exercise_id,
    media_url,
    caption,
    category: isAdminEmail(profile.email) ? 'admin_test' : 'publicacao',
  });

  if (error) return NextResponse.redirect(new URL('/aluno/comunidade?erro=publicar', request.url));
  return NextResponse.redirect(new URL('/aluno/comunidade?sucesso=publicado', request.url));
}
