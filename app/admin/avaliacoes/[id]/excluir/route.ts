import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string }> };

function appendParam(url: string, key: string, value: string) {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

function isAjax(request: Request) {
  return request.headers.get('x-hub-ajax') === '1' || request.headers.get('accept')?.includes('application/json');
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const ajax = isAjax(request);
  const form = await request.formData().catch(() => null);
  const returnTo = String(form?.get('return_to') || '/admin/avaliacoes');
  const supabase = createAdminClient();

  const { data: submission } = await supabase.from('submissions').select('id,file_url').eq('id', id).maybeSingle();
  if (!submission?.id) {
    if (ajax) return NextResponse.json({ ok: false, error: 'envio-nao-encontrado' }, { status: 404 });
    return NextResponse.redirect(new URL(appendParam(returnTo, 'erro', 'envio-nao-encontrado'), request.url));
  }

  const { data: posts } = await supabase.from('community_posts').select('id').eq('submission_id', id);
  const postIds = posts?.map((p: any) => p.id) || [];
  if (postIds.length) {
    await supabase.from('community_comments').delete().in('post_id', postIds);
    await supabase.from('community_likes').delete().in('post_id', postIds);
  }

  await supabase.from('community_posts').delete().eq('submission_id', id);
  await supabase.from('reviews').delete().eq('submission_id', id);
  const { error } = await supabase.from('submissions').delete().eq('id', id);
  if (error) {
    if (ajax) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.redirect(new URL(appendParam(returnTo, 'erro', error.message), request.url));
  }

  if (ajax) return NextResponse.json({ ok: true, id });
  return NextResponse.redirect(new URL(appendParam(returnTo, 'sucesso', 'excluido'), request.url));
}
