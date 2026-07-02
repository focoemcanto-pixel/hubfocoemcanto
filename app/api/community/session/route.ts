import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const email = (await cookies()).get('hub_access_email')?.value;
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('id,email,name').eq('email', email).maybeSingle();
  if (!profile?.id) return NextResponse.json({ ok: false }, { status: 404 });
  const { data: follows } = await supabase.from('community_follows').select('following_id').eq('follower_id', profile.id);
  return NextResponse.json({ ok: true, profile, followingIds: (follows || []).map((row: any) => String(row.following_id || '')).filter(Boolean) });
}
