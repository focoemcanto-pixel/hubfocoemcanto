import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function currentProfile() {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  if (!email) return null;
  const supabase = createAdminClient();
  const { data } = await supabase.from('profiles').select('id,email,name').eq('email', email).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from('profiles').insert({ email, name: email.split('@')[0], role: 'student' }).select('id,email,name').single();
  return created || null;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const postId = String(formData.get('post_id') || '').trim();
  const comment = String(formData.get('comment') || '').trim();
  const returnTo = String(formData.get('return_to') || '/aluno/comunidade');
  if (!postId || !comment) return NextResponse.redirect(new URL(returnTo, request.url));

  const profile = await currentProfile();
  if (!profile) return NextResponse.redirect(new URL('/aluno/comunidade?erro=perfil', request.url));

  const supabase = createAdminClient();
  await supabase.from('community_comments').insert({ post_id: postId, profile_id: profile.id, comment });
  const { count } = await supabase.from('community_comments').select('*', { count: 'exact', head: true }).eq('post_id', postId);
  await supabase.from('community_posts').update({ comments_count: count || 0 }).eq('id', postId);

  return NextResponse.redirect(new URL(returnTo, request.url));
}
