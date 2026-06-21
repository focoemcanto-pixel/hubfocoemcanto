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

function wantsJson(request: Request) {
  return request.headers.get('accept')?.includes('application/json');
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const postId = String(formData.get('post_id') || '').trim();
  const returnTo = String(formData.get('return_to') || '/aluno/comunidade');
  if (!postId) return wantsJson(request) ? NextResponse.json({ error: 'missing_post' }, { status: 400 }) : NextResponse.redirect(new URL(returnTo, request.url));

  const profile = await currentProfile();
  if (!profile) return wantsJson(request) ? NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) : NextResponse.redirect(new URL('/aluno/comunidade?erro=perfil', request.url));

  const supabase = createAdminClient();
  const { data: existingRows } = await supabase
    .from('community_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('profile_id', profile.id)
    .limit(10);

  const alreadyLiked = Boolean(existingRows?.length);
  let liked = false;

  if (alreadyLiked) {
    await supabase.from('community_likes').delete().eq('post_id', postId).eq('profile_id', profile.id);
  } else {
    await supabase.from('community_likes').insert({ post_id: postId, profile_id: profile.id });
    liked = true;
  }

  const { count } = await supabase.from('community_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId);
  await supabase.from('community_posts').update({ likes_count: count || 0 }).eq('id', postId);

  if (wantsJson(request)) return NextResponse.json({ ok: true, liked, likes_count: count || 0 });
  return NextResponse.redirect(new URL(returnTo, request.url));
}
