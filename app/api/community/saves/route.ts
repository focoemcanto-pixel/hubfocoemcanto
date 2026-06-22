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

function schemaMissing(message?: string) {
  const value = String(message || '').toLowerCase();
  return value.includes('community_saves') || value.includes('schema cache') || value.includes('does not exist') || value.includes('relation') || value.includes('42p01');
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const postId = String(formData.get('post_id') || '').trim();
  const saved = String(formData.get('saved') || 'true') === 'true';
  if (!postId) return NextResponse.json({ error: 'missing_post' }, { status: 400 });
  const supabase = createAdminClient();
  const profile = await currentProfile(supabase);
  if (!profile) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  if (saved) {
    const { data, error } = await supabase
      .from('community_saves')
      .upsert({ post_id: postId, profile_id: profile.id }, { onConflict: 'post_id,profile_id', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: schemaMissing(error.message) ? 'schema_missing' : 'save_failed', detail: error.message, sql: 'supabase/004_profile_and_community_persistence.sql' }, { status: 500 });
    return NextResponse.json({ ok: true, saved: true, id: data?.id || null });
  }

  const { error } = await supabase.from('community_saves').delete().eq('post_id', postId).eq('profile_id', profile.id);
  if (error) return NextResponse.json({ error: schemaMissing(error.message) ? 'schema_missing' : 'unsave_failed', detail: error.message, sql: 'supabase/004_profile_and_community_persistence.sql' }, { status: 500 });
  return NextResponse.json({ ok: true, saved: false });
}
