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

export async function POST(request: Request) {
  const form = await request.formData();
  const followingId = String(form.get('following_id') || '').trim();
  const nextValue = String(form.get('following') || 'true') === 'true';
  const returnTo = String(form.get('return_to') || '/aluno/comunidade');

  if (!followingId) {
    return wantsJson(request)
      ? NextResponse.json({ error: 'missing_following', detail: 'Perfil de destino não informado.' }, { status: 400 })
      : NextResponse.redirect(new URL(returnTo, request.url));
  }

  const supabase = createAdminClient();
  const profile = await currentProfile(supabase);

  if (!profile?.id) {
    return wantsJson(request)
      ? NextResponse.json({ error: 'not_authenticated', detail: 'Faça login novamente para seguir alunos.' }, { status: 401 })
      : NextResponse.redirect(new URL('/aluno/comunidade?erro=perfil', request.url));
  }

  if (profile.id === followingId) {
    return wantsJson(request)
      ? NextResponse.json({ ok: true, following: false, self: true })
      : NextResponse.redirect(new URL(returnTo, request.url));
  }

  if (nextValue) {
    const { error } = await supabase
      .from('community_follows')
      .upsert({ follower_id: profile.id, following_id: followingId }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true });

    if (error) {
      return wantsJson(request)
        ? NextResponse.json({ error: 'follow_failed', detail: error.message }, { status: 500 })
        : NextResponse.redirect(new URL(returnTo, request.url));
    }

    return wantsJson(request)
      ? NextResponse.json({ ok: true, following: true })
      : NextResponse.redirect(new URL(returnTo, request.url));
  }

  const { error } = await supabase.from('community_follows').delete().eq('follower_id', profile.id).eq('following_id', followingId);
  if (error) {
    return wantsJson(request)
      ? NextResponse.json({ error: 'unfollow_failed', detail: error.message }, { status: 500 })
      : NextResponse.redirect(new URL(returnTo, request.url));
  }

  return wantsJson(request)
    ? NextResponse.json({ ok: true, following: false })
    : NextResponse.redirect(new URL(returnTo, request.url));
}
