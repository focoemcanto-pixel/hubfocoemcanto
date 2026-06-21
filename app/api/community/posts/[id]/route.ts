import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const supabase = createAdminClient();
  const { data: post, error } = await supabase.from('community_posts').select('id,profile_id').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: 'post_lookup_failed' }, { status: 500 });
  if (!post) return NextResponse.json({ error: 'post_not_found' }, { status: 404 });
  if (post.profile_id !== profile.id) return NextResponse.json({ error: 'not_allowed' }, { status: 403 });

  await supabase.from('community_comments').delete().eq('post_id', id);
  await supabase.from('community_likes').delete().eq('post_id', id);
  const { error: removeError } = await supabase.from('community_posts').delete().eq('id', id).eq('profile_id', profile.id);
  if (removeError) return NextResponse.json({ error: 'post_remove_failed' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
