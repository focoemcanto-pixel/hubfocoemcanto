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

export async function GET() {
  const profile = await currentProfile();
  if (!profile?.id) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data: challenge, error } = await supabase
    .from('weekly_challenges')
    .select('id,slug,title,theme,description,instructions,duration_minutes,level,starts_at,ends_at')
    .eq('is_published', true)
    .lte('starts_at', now)
    .gte('ends_at', now)
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data: completions } = await supabase
    .from('weekly_challenge_completions')
    .select('challenge_id,completed_at')
    .eq('profile_id', profile.id)
    .order('completed_at', { ascending: false });

  const completed = Boolean(challenge && (completions || []).some((item) => item.challenge_id === challenge.id));
  return NextResponse.json({
    ok: true,
    challenge,
    completed,
    totalCompleted: completions?.length || 0,
  });
}

export async function POST(request: Request) {
  const profile = await currentProfile();
  if (!profile?.id) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const challengeId = String(body?.challengeId || '');
  if (!challengeId) return NextResponse.json({ ok: false, error: 'challenge_required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('weekly_challenge_completions')
    .upsert({ challenge_id: challengeId, profile_id: profile.id, completed_at: new Date().toISOString() }, { onConflict: 'challenge_id,profile_id' });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, completedAt: new Date().toISOString() });
}
