import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const returnTo = String(form?.get('return_to') || '/admin/avaliacoes');
  const supabase = createAdminClient();

  const { data: submission } = await supabase
    .from('submissions')
    .select('id,file_url')
    .eq('id', id)
    .maybeSingle();

  if (!submission?.id) return NextResponse.redirect(new URL(`${returnTo}?erro=envio-nao-encontrado`, request.url));

  await supabase.from('community_comments').delete().in('post_id', (await supabase.from('community_posts').select('id').eq('submission_id', id)).data?.map((p: any) => p.id) || []);
  await supabase.from('community_likes').delete().in('post_id', (await supabase.from('community_posts').select('id').eq('submission_id', id)).data?.map((p: any) => p.id) || []);
  await supabase.from('community_posts').delete().eq('submission_id', id);
  await supabase.from('reviews').delete().eq('submission_id', id);

  const { error } = await supabase.from('submissions').delete().eq('id', id);
  if (error) return NextResponse.redirect(new URL(`${returnTo}?erro=${encodeURIComponent(error.message)}`, request.url));

  return NextResponse.redirect(new URL(`${returnTo}?sucesso=excluido`, request.url));
}
