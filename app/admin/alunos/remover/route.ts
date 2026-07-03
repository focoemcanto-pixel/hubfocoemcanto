import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type DeleteStep = { table: string; column: string; value: string };

function wantsJson(request: Request) {
  return request.headers.get('x-hub-ajax') === '1' || request.headers.get('accept')?.includes('application/json');
}

function schemaMissing(message?: string) {
  const value = String(message || '').toLowerCase();
  return value.includes('does not exist') || value.includes('schema cache') || value.includes('relation') || value.includes('column') || value.includes('42p01') || value.includes('42703');
}

async function deleteWhere(supabase: ReturnType<typeof createAdminClient>, step: DeleteStep, errors: string[]) {
  if (!step.value) return;
  const { error } = await supabase.from(step.table).delete().eq(step.column, step.value);
  if (error && !schemaMissing(error.message)) errors.push(`${step.table}.${step.column}: ${error.message}`);
}

async function deletePostRelations(supabase: ReturnType<typeof createAdminClient>, postIds: string[], errors: string[]) {
  if (!postIds.length) return;
  const relationTables = ['community_likes', 'community_comments', 'community_saves', 'community_reposts'];
  for (const table of relationTables) {
    const { error } = await supabase.from(table).delete().in('post_id', postIds);
    if (error && !schemaMissing(error.message)) errors.push(`${table}.post_id: ${error.message}`);
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const id = String(formData.get('id') || '').trim();
  const ajax = wantsJson(request);
  if (!id) {
    return ajax ? NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 }) : NextResponse.redirect(new URL('/admin/alunos?error=id', request.url));
  }

  const supabase = createAdminClient();
  const errors: string[] = [];
  const { data: profile } = await supabase.from('profiles').select('id,email').eq('id', id).maybeSingle();
  const email = String(profile?.email || '').trim().toLowerCase();

  const { data: posts } = await supabase.from('community_posts').select('id').eq('profile_id', id);
  const postIds = (posts || []).map((post: any) => String(post.id)).filter(Boolean);
  await deletePostRelations(supabase, postIds, errors);

  const steps: DeleteStep[] = [
    { table: 'community_follows', column: 'follower_id', value: id },
    { table: 'community_follows', column: 'following_id', value: id },
    { table: 'community_likes', column: 'profile_id', value: id },
    { table: 'community_comments', column: 'profile_id', value: id },
    { table: 'community_saves', column: 'profile_id', value: id },
    { table: 'community_reposts', column: 'profile_id', value: id },
    { table: 'community_posts', column: 'profile_id', value: id },
    { table: 'submissions', column: 'profile_id', value: id },
    { table: 'subscriptions', column: 'profile_id', value: id },
    { table: 'student_progress', column: 'profile_id', value: id },
    { table: 'lesson_progress', column: 'profile_id', value: id },
    { table: 'exercise_progress', column: 'profile_id', value: id },
    { table: 'notifications', column: 'profile_id', value: id },
    { table: 'notification_reads', column: 'profile_id', value: id },
    { table: 'profiles', column: 'id', value: id },
  ];
  if (email) {
    steps.splice(steps.length - 1, 0,
      { table: 'subscriptions', column: 'provider_customer_id', value: email },
      { table: 'kiwify_webhook_events', column: 'customer_email', value: email },
    );
  }

  for (const step of steps) await deleteWhere(supabase, step, errors);

  if (errors.length) {
    return ajax
      ? NextResponse.json({ ok: false, error: 'delete_failed', details: errors }, { status: 500 })
      : NextResponse.redirect(new URL('/admin/alunos?error=delete', request.url));
  }

  return ajax ? NextResponse.json({ ok: true, removed: id }) : NextResponse.redirect(new URL('/admin/alunos?removed=1', request.url));
}
