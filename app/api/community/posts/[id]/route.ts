import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function currentProfile() {
  const email = (await cookies()).get('hub_access_email')?.value;
  if (!email) return null;
  const supabase = createAdminClient();
  const { data } = await supabase.from('profiles').select('id,email,name').eq('email', email).maybeSingle();
  return data || null;
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'missing_post' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: post, error } = await supabase.from('community_posts').select('id,profile_id').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: 'post_lookup_failed', detail: error.message }, { status: 500 });
  if (!post) return NextResponse.json({ error: 'post_not_found' }, { status: 404 });
  if (post.profile_id !== profile.id) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });

  await Promise.all([
    supabase.from('community_comments').delete().eq('post_id', id),
    supabase.from('community_likes').delete().eq('post_id', id),
    supabase.from('community_saves').delete().eq('post_id', id).then(() => null),
    supabase.from('community_reposts').delete().eq('post_id', id).then(() => null),
  ]);

  const { data: removed, error: removeError } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', id)
    .eq('profile_id', profile.id)
    .select('id')
    .maybeSingle();

  if (removeError) return NextResponse.json({ error: 'post_remove_failed', detail: removeError.message }, { status: 500 });
  if (!removed?.id) return NextResponse.json({ error: 'post_not_removed' }, { status: 409 });

  return NextResponse.json({ ok: true, removed_id: id });
}
