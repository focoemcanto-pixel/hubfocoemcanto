import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const [{ id }, cookieStore] = await Promise.all([context.params, cookies()]);
  const email = cookieStore.get('hub_access_email')?.value || '';
  if (!email) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  if (!id) return NextResponse.json({ error: 'missing_job_id' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
  if (!profile?.id) return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });

  const { data: job, error } = await supabase
    .from('duet_render_jobs')
    .select('id,status,output_url,error_message,created_at,started_at,completed_at')
    .eq('id', id)
    .eq('profile_id', profile.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'job_query_failed', detail: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: 'job_not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, job });
}
