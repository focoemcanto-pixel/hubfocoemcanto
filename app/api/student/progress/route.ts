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

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value;

  if (!email) {
    return NextResponse.json({ ok: false, message: 'Aluno não identificado.' }, { status: 401 });
  }

  const parsed = ProgressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Dados inválidos.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (profileError || !profile?.id) {
    return NextResponse.json({ ok: false, message: 'Perfil do aluno não encontrado.' }, { status: 404 });
  }

  const payload = {
    profile_id: profile.id,
    exercise_id: parsed.data.exerciseId,
    last_position_seconds: Math.floor(parsed.data.positionSeconds || 0),
    completed: parsed.data.completed,
    completed_at: parsed.data.completed ? new Date().toISOString() : null,
    last_watched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('lesson_progress')
    .upsert(payload, { onConflict: 'profile_id,exercise_id' })
    .select('id,completed,last_position_seconds,last_watched_at')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: 'Não foi possível salvar o progresso.', error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, progress: data });
}
