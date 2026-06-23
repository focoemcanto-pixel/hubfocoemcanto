import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ProgressSchema = z.object({
  exerciseId: z.string().uuid(),
  positionSeconds: z.number().min(0).optional().default(0),
  completed: z.boolean().optional().default(false),
});

function missingTable(message?: string | null) {
  const text = String(message || '').toLowerCase();
  return text.includes('does not exist') || text.includes('schema cache') || text.includes('42p01') || text.includes('lesson_progress');
}

async function saveProgress(supabase: ReturnType<typeof createAdminClient>, payload: any) {
  const primary = await supabase
    .from('lesson_progress')
    .upsert(payload, { onConflict: 'profile_id,exercise_id' })
    .select('id,completed,last_position_seconds,last_watched_at')
    .single();

  if (!primary.error) return primary;
  if (!missingTable(primary.error.message)) return primary;

  const legacyPayload = {
    profile_id: payload.profile_id,
    exercise_id: payload.exercise_id,
    completed: payload.completed,
    completed_at: payload.completed_at,
    updated_at: payload.updated_at,
  };

  const legacy = await supabase
    .from('exercise_progress')
    .upsert(legacyPayload, { onConflict: 'profile_id,exercise_id' })
    .select('id,completed,updated_at')
    .single();

  if (legacy.error) return { data: null, error: legacy.error };
  return {
    data: {
      id: legacy.data?.id,
      completed: legacy.data?.completed,
      last_position_seconds: payload.last_position_seconds,
      last_watched_at: legacy.data?.updated_at || payload.last_watched_at,
    },
    error: null,
  };
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;

  if (!email) return NextResponse.json({ ok: false, message: 'Aluno não identificado.' }, { status: 401 });

  const parsed = ProgressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Dados inválidos.' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();

  if (profileError || !profile?.id) return NextResponse.json({ ok: false, message: 'Perfil do aluno não encontrado.' }, { status: 404 });

  const payload = {
    profile_id: profile.id,
    exercise_id: parsed.data.exerciseId,
    last_position_seconds: Math.floor(parsed.data.positionSeconds || 0),
    completed: parsed.data.completed,
    completed_at: parsed.data.completed ? new Date().toISOString() : null,
    last_watched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await saveProgress(supabase, payload);

  if (error) {
    return NextResponse.json({ ok: false, message: 'Não foi possível salvar o progresso.', error: error.message, sql: 'supabase/010_lesson_progress.sql' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, progress: data });
}
