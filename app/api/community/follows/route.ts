import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function currentProfile(supabase: ReturnType<typeof createAdminClient>) {
  const email = (await cookies()).get('hub_access_email')?.value;
  if (!email) return null;
  const { data } = await supabase.from('profiles').select('id,email,name').eq('email', email).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from('profiles').insert({ email, name: email.split('@')[0], role: 'student' }).select('id,email,name').single();
  return created || null;
}

function wantsJson(request: Request) {
  return request.headers.get('accept')?.includes('application/json');
}

async function followCounts(supabase: ReturnType<typeof createAdminClient>, followerId: string, followingId: string) {
  const [{ count: targetFollowers }, { count: meFollowing }] = await Promise.all([
    supabase.from('community_follows').select('id', { count: 'exact', head: true }).eq('following_id', followingId),
    supabase.from('community_follows').select('id', { count: 'exact', head: true }).eq('follower_id', followerId),
  ]);
  return { target_followers_count: targetFollowers || 0, me_following_count: meFollowing || 0 };
}

async function isFollowing(supabase: ReturnType<typeof createAdminClient>, followerId: string, followingId: string) {
  const { data } = await supabase
    .from('community_follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  return Boolean(data?.id);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const followingId = String(form.get('following_id') || '').trim();
  const nextValue = String(form.get('following') || 'true') === 'true';
  const returnTo = String(form.get('return_to') || '/aluno/comunidade');

  if (!followingId) {
    return wantsJson(request) ? NextResponse.json({ error: 'missing_following', detail: 'Perfil de destino não informado.' }, { status: 400 }) : NextResponse.redirect(new URL(returnTo, request.url));
  }

  const supabase = createAdminClient();
  const profile = await currentProfile(supabase);

  if (!profile?.id) {
    return wantsJson(request) ? NextResponse.json({ error: 'not_authenticated', detail: 'Faça login novamente para seguir alunos.' }, { status: 401 }) : NextResponse.redirect(new URL('/aluno/comunidade?erro=perfil', request.url));
  }

  if (profile.id === followingId) {
    const counts = await followCounts(supabase, profile.id, followingId).catch(() => ({ target_followers_count: 0, me_following_count: 0 }));
    return wantsJson(request) ? NextResponse.json({ ok: true, following: false, self: true, ...counts }) : NextResponse.redirect(new URL(returnTo, request.url));
  }

  if (nextValue) {
    const alreadyFollowing = await isFollowing(supabase, profile.id, followingId);
    if (!alreadyFollowing) {
      const { error } = await supabase.from('community_follows').insert({ follower_id: profile.id, following_id: followingId });
      if (error) return wantsJson(request) ? NextResponse.json({ error: 'follow_failed', detail: error.message }, { status: 500 }) : NextResponse.redirect(new URL(returnTo, request.url));
    }
  } else {
    const { error } = await supabase.from('community_follows').delete().eq('follower_id', profile.id).eq('following_id', followingId);
    if (error) return wantsJson(request) ? NextResponse.json({ error: 'unfollow_failed', detail: error.message }, { status: 500 }) : NextResponse.redirect(new URL(returnTo, request.url));
  }

  const following = await isFollowing(supabase, profile.id, followingId);
  const counts = await followCounts(supabase, profile.id, followingId).catch(() => ({ target_followers_count: 0, me_following_count: 0 }));

  return wantsJson(request) ? NextResponse.json({ ok: true, following, ...counts }) : NextResponse.redirect(new URL(returnTo, request.url));
}
