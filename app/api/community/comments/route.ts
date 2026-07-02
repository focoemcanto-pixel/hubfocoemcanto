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
  return request.headers.get('accept')?.includes('application/json') || request.headers.get('content-type')?.includes('application/json');
}

async function syncCommentCount(supabase: ReturnType<typeof createAdminClient>, postId: string) {
  const { count } = await supabase.from('community_comments').select('id', { count: 'exact', head: true }).eq('post_id', postId);
  const commentsCount = count || 0;
  await supabase.from('community_posts').update({ comments_count: commentsCount }).eq('id', postId);
  return commentsCount;
}

async function readBody(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return {
      postId: String(body.post_id || '').trim(),
      comment: String(body.comment || '').trim(),
      returnTo: String(body.return_to || '/aluno/comunidade'),
    };
  }
  const formData = await request.formData();
  return {
    postId: String(formData.get('post_id') || '').trim(),
    comment: String(formData.get('comment') || '').trim(),
    returnTo: String(formData.get('return_to') || '/aluno/comunidade'),
  };
}

async function decorateComments(supabase: ReturnType<typeof createAdminClient>, rows: any[]) {
  const profileIds = Array.from(new Set(rows.map((item) => item.profile_id).filter(Boolean)));
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id,name,avatar_url').in('id', profileIds)
    : { data: [] as any[] };
  const profileById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
  return rows.map((item: any) => {
    const profile = profileById.get(item.profile_id);
    return {
      id: item.id,
      text: item.comment || item.text || item.body || '',
      createdAt: item.created_at,
      authorName: profile?.name || 'Aluno VIP',
      authorAvatarUrl: profile?.avatar_url || null,
    };
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postId = String(searchParams.get('post_id') || '').trim();
  if (!postId) return NextResponse.json({ error: 'missing_post', detail: 'Post não informado.' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('community_comments')
    .select('id,post_id,profile_id,comment,created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: 'comments_fetch_failed', detail: error.message }, { status: 500 });

  const comments = await decorateComments(supabase, data || []);
  const commentsCount = await syncCommentCount(supabase, postId).catch(() => comments.length);
  return NextResponse.json({ ok: true, comments, comments_count: commentsCount });
}

export async function POST(request: Request) {
  const { postId, comment, returnTo } = await readBody(request);
  if (!postId || !comment) {
    return wantsJson(request)
      ? NextResponse.json({ error: 'missing_comment', detail: 'Escreva um comentário antes de enviar.' }, { status: 400 })
      : NextResponse.redirect(new URL(returnTo, request.url));
  }

  const supabase = createAdminClient();
  const profile = await currentProfile(supabase);
  if (!profile?.id) {
    return wantsJson(request)
      ? NextResponse.json({ error: 'not_authenticated', detail: 'Faça login novamente para comentar.' }, { status: 401 })
      : NextResponse.redirect(new URL('/aluno/comunidade?erro=perfil', request.url));
  }

  const { data: post } = await supabase.from('community_posts').select('id').eq('id', postId).maybeSingle();
  if (!post?.id) {
    return wantsJson(request)
      ? NextResponse.json({ error: 'post_not_found', detail: 'Publicação não encontrada.' }, { status: 404 })
      : NextResponse.redirect(new URL(returnTo, request.url));
  }

  const { data: inserted, error: insertError } = await supabase
    .from('community_comments')
    .insert({ post_id: postId, profile_id: profile.id, comment })
    .select('id,post_id,profile_id,comment,created_at')
    .single();

  if (insertError) {
    return wantsJson(request)
      ? NextResponse.json({ error: 'comment_failed', detail: insertError.message }, { status: 500 })
      : NextResponse.redirect(new URL(returnTo, request.url));
  }

  const commentsCount = await syncCommentCount(supabase, postId);
  const savedComment = {
    id: inserted?.id,
    text: inserted?.comment || comment,
    createdAt: inserted?.created_at,
    authorName: profile.name || 'Você',
    authorAvatarUrl: (profile as any).avatar_url || null,
  };

  return wantsJson(request)
    ? NextResponse.json({ ok: true, comment: savedComment, comments_count: commentsCount })
    : NextResponse.redirect(new URL(returnTo, request.url));
}
