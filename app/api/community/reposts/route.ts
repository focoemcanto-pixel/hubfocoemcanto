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

export async function POST(request: Request) {
  const form = await request.formData();
  const postId = String(form.get('post_id') || '').trim();
  const reposted = String(form.get('reposted') || 'true') === 'true';
  if (!postId) return NextResponse.json({ error: 'missing_post' }, { status: 400 });
  const supabase = createAdminClient();
  const profile = await currentProfile(supabase);
  if (!profile) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  if (reposted) {
    const { error } = await supabase.from('community_reposts').upsert({ post_id: postId, profile_id: profile.id }, { onConflict: 'post_id,profile_id', ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: 'repost_failed', detail: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from('community_reposts').delete().eq('post_id', postId).eq('profile_id', profile.id);
    if (error) return NextResponse.json({ error: 'unrepost_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reposted });
}
