import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function currentProfile(supabase: ReturnType<typeof createAdminClient>) {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
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
  const formData = await request.formData();
  const postId = String(formData.get('post_id') || '').trim();
  const returnTo = String(formData.get('return_to') || '/aluno/comunidade');
  if (!postId) return wantsJson(request) ? NextResponse.json({ error: 'missing_post' }, { status: 400 }) : NextResponse.redirect(new URL(returnTo, request.url));

  const supabase = createAdminClient();
  const profile = await currentProfile(supabase);
  if (!profile) return wantsJson(request) ? NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) : NextResponse.redirect(new URL('/aluno/comunidade?erro=perfil', request.url));

  const { error: insertError } = await supabase
    .from('community_likes')
    .upsert({ post_id: postId, profile_id: profile.id }, { onConflict: 'post_id,profile_id', ignoreDuplicates: true });

  if (insertError) return wantsJson(request) ? NextResponse.json({ error: 'like_failed', detail: insertError.message }, { status: 500 }) : NextResponse.redirect(new URL(returnTo, request.url));

  // A interface já aplica a curtida instantaneamente. O contador consolidado pode ser atualizado por rotina/banco sem atrasar o toque.
  if (wantsJson(request)) return NextResponse.json({ ok: true, liked: true });
  return NextResponse.redirect(new URL(returnTo, request.url));
}
