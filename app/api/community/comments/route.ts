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
  const comment = String(formData.get('comment') || '').trim();
  const returnTo = String(formData.get('return_to') || '/aluno/comunidade');
  if (!postId || !comment) return wantsJson(request) ? NextResponse.json({ error: 'missing_comment' }, { status: 400 }) : NextResponse.redirect(new URL(returnTo, request.url));

  const supabase = createAdminClient();
  const profile = await currentProfile(supabase);
  if (!profile) return wantsJson(request) ? NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) : NextResponse.redirect(new URL('/aluno/comunidade?erro=perfil', request.url));

  const { data: inserted, error: insertError } = await supabase
    .from('community_comments')
    .insert({ post_id: postId, profile_id: profile.id, comment })
    .select('id,comment,created_at')
    .single();

  if (insertError) return wantsJson(request) ? NextResponse.json({ error: 'comment_failed', detail: insertError.message }, { status: 500 }) : NextResponse.redirect(new URL(returnTo, request.url));

  // O comentário aparece instantâneo no cliente. Evitamos contar todos os comentários a cada envio.
  if (wantsJson(request)) return NextResponse.json({ ok: true, comment: inserted || { comment } });
  return NextResponse.redirect(new URL(returnTo, request.url));
}
