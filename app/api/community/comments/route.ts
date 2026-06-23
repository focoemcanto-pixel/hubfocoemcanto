import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function currentProfile(supabase: ReturnType<typeof createAdminClient>) {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;
  if (!email) return null;
  const { data } = await supabase.from('profiles').select('id,email,name,avatar_url').eq('email', email).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from('profiles').insert({ email, name: email.split('@')[0], role: 'student' }).select('id,email,name,avatar_url').single();
  return created || null;
}

function wantsJson(request: Request) {
  return request.headers.get('accept')?.includes('application/json');
}

async function syncCommentCount(supabase: ReturnType<typeof createAdminClient>, postId: string) {
  const { count } = await supabase.from('community_comments').select('id', { count: 'exact', head: true }).eq('post_id', postId);
  const commentsCount = count || 0;
  await supabase.from('community_posts').update({ comments_count: commentsCount }).eq('id', postId);
  return commentsCount;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postId = String(searchParams.get('post_id') || '').trim();
  if (!postId) return NextResponse.json({ error: 'missing_post' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('community_comments')
    .select('id,comment,created_at,profiles(name,avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(80);

  if (error) return NextResponse.json({ error: 'comments_fetch_failed', detail: error.message }, { status: 500 });

  const comments = (data || []).map((item: any) => {
    const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
    return {
      id: item.id,
      text: item.comment,
      createdAt: item.created_at,
      authorName: profile?.name || 'Aluno VIP',
      authorAvatarUrl: profile?.avatar_url || null,
    };
  });

  return NextResponse.json({ ok: true, comments });
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

  const commentsCount = await syncCommentCount(supabase, postId);
  const savedComment = {
    id: inserted?.id,
    text: inserted?.comment || comment,
    createdAt: inserted?.created_at,
    authorName: profile.name || 'Você',
    authorAvatarUrl: (profile as any).avatar_url || null,
  };

  if (wantsJson(request)) return NextResponse.json({ ok: true, comment: savedComment, comments_count: commentsCount });
  return NextResponse.redirect(new URL(returnTo, request.url));
}
