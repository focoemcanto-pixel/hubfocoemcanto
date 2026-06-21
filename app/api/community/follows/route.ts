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
  const followingId = String(form.get('following_id') || '').trim();
  const nextValue = String(form.get('following') || 'true') === 'true';
  if (!followingId) return NextResponse.json({ error: 'missing_following' }, { status: 400 });

  const supabase = createAdminClient();
  const profile = await currentProfile(supabase);
  if (!profile?.id) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  if (profile.id === followingId) return NextResponse.json({ ok: true, following: false });

  if (nextValue) {
    const { error } = await supabase
      .from('community_follows')
      .upsert({ follower_id: profile.id, following_id: followingId }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: 'follow_failed', detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, following: true });
  }

  const { error } = await supabase.from('community_follows').delete().eq('follower_id', profile.id).eq('following_id', followingId);
  if (error) return NextResponse.json({ error: 'unfollow_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, following: false });
}
