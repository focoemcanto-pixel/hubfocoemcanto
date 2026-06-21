import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function currentProfile() {
  const email = (await cookies()).get('hub_access_email')?.value;
  if (!email) return null;
  const supabase = createAdminClient();
  const { data } = await supabase.from('profiles').select('id,email,name').eq('email', email).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from('profiles').insert({ email, name: email.split('@')[0], role: 'student' }).select('id,email,name').single();
  return created || null;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const followingId = String(form.get('following_id') || '').trim();
  if (!followingId) return NextResponse.json({ error: 'missing_following' }, { status: 400 });

  const profile = await currentProfile();
  if (!profile?.id) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  if (profile.id === followingId) return NextResponse.json({ ok: true, following: false });

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('community_follows')
    .select('id')
    .eq('follower_id', profile.id)
    .eq('following_id', followingId)
    .maybeSingle();

  let following = false;
  if (existing?.id) {
    await supabase.from('community_follows').delete().eq('id', existing.id);
  } else {
    await supabase.from('community_follows').insert({ follower_id: profile.id, following_id: followingId });
    following = true;
  }

  return NextResponse.json({ ok: true, following });
}
