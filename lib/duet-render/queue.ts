import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccessActive } from '@/lib/access/products';

export const DUET_RENDER_BUCKET = 'submission-media';

type ResolveResult =
  | { exercise: { id: string }; profile: { id: string; email?: string | null }; canRequestReview: boolean }
  | { error: NextResponse };

export function pathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export function parseBoolean(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function parseInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function hasVipSubscription(rows: any[]) {
  return rows.some((sub) => sub.course_key === 'grupo-vip' && isAccessActive(sub.status));
}

export async function resolveExerciseAndProfile(supabase: ReturnType<typeof createAdminClient>, lessonSlug: string, email: string): Promise<ResolveResult> {
  const [{ data: exercise, error: exerciseError }, { data: profile, error: profileQueryError }] = await Promise.all([
    supabase.from('exercises').select('id').eq('slug', lessonSlug).maybeSingle(),
    supabase.from('profiles').select('id,email').eq('email', email).maybeSingle(),
  ]);

  if (exerciseError) return { error: NextResponse.json({ error: 'exercise_query_failed', detail: exerciseError.message }, { status: 500 }) };
  if (!exercise?.id) return { error: NextResponse.json({ error: 'exercise_not_found' }, { status: 404 }) };
  if (profileQueryError) return { error: NextResponse.json({ error: 'profile_query_failed', detail: profileQueryError.message }, { status: 500 }) };

  let currentProfile = profile;
  if (!currentProfile?.id) {
    const { data: created, error: profileError } = await supabase
      .from('profiles')
      .insert({ email, name: email.split('@')[0], role: 'student' })
      .select('id,email')
      .single();
    if (profileError || !created) return { error: NextResponse.json({ error: 'profile_failed', detail: profileError?.message }, { status: 500 }) };
    currentProfile = created;
  }

  const { data: subscriptions } = await supabase.from('subscriptions').select('course_key,status').eq('profile_id', currentProfile.id);
  return { exercise, profile: currentProfile, canRequestReview: hasVipSubscription(subscriptions || []) };
}

export async function uploadRenderInput(supabase: ReturnType<typeof createAdminClient>, objectPath: string, file: File, fallbackType: string) {
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength < 1000) throw new Error(`empty_file:${objectPath}`);
  const contentType = file.type || fallbackType;
  const uploaded = await supabase.storage.from(DUET_RENDER_BUCKET).upload(objectPath, bytes, { contentType, upsert: true });
  if (uploaded.error) throw new Error(uploaded.error.message);
  return { path: objectPath, url: supabase.storage.from(DUET_RENDER_BUCKET).getPublicUrl(objectPath).data.publicUrl };
}

export async function uploadRenderOutput(supabase: ReturnType<typeof createAdminClient>, objectPath: string, bytes: ArrayBuffer) {
  if (bytes.byteLength < 1000) throw new Error(`empty_output:${objectPath}`);
  const uploaded = await supabase.storage.from(DUET_RENDER_BUCKET).upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true });
  if (uploaded.error) throw new Error(uploaded.error.message);
  return { path: objectPath, url: supabase.storage.from(DUET_RENDER_BUCKET).getPublicUrl(objectPath).data.publicUrl };
}
