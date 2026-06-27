import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const StudySchema = z.object({
  songName: z.string().trim().min(1).max(140),
  youtubeUrl: z.string().trim().url().max(500),
  originalKey: z.string().trim().min(1).max(24),
  studyKey: z.string().trim().min(1).max(24),
  semitoneTransposition: z.number().int().min(-24).max(24),
  bpm: z.number().int().min(30).max(260).nullable().optional(),
  notes: z.string().trim().max(4000).optional().default(''),
  summary: z.string().trim().max(5000).optional().default(''),
});

function extractYouTubeId(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null;
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/').filter(Boolean)[1] || null;
      return parsed.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

async function getProfileId() {
  const email = (await cookies()).get('hub_access_email')?.value;
  if (!email) return { profileId: null, error: 'Aluno não identificado.' };
  const supabase = createAdminClient();
  const { data: profile, error } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
  if (error || !profile?.id) return { profileId: null, error: 'Perfil do aluno não encontrado.' };
  return { profileId: profile.id as string, error: null };
}

export async function POST(request: Request) {
  const parsed = StudySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Preencha música, link do YouTube e controles do estudo.' }, { status: 400 });

  const youtubeVideoId = extractYouTubeId(parsed.data.youtubeUrl);
  if (!youtubeVideoId) return NextResponse.json({ ok: false, message: 'Informe um link válido do YouTube.' }, { status: 400 });

  const { profileId, error: profileError } = await getProfileId();
  if (!profileId) return NextResponse.json({ ok: false, message: profileError }, { status: 401 });

  const supabase = createAdminClient();
  const payload = {
    profile_id: profileId,
    song_name: parsed.data.songName,
    youtube_url: parsed.data.youtubeUrl,
    youtube_video_id: youtubeVideoId,
    original_key: parsed.data.originalKey,
    study_key: parsed.data.studyKey,
    semitone_transposition: parsed.data.semitoneTransposition,
    bpm: parsed.data.bpm || null,
    notes: parsed.data.notes || null,
    summary: parsed.data.summary || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('repertoire_studies').insert(payload).select('*').single();
  if (error) return NextResponse.json({ ok: false, message: 'Não foi possível salvar o estudo.', error: error.message, sql: 'supabase/migrations/20260627_create_repertoire_studies.sql' }, { status: 500 });
  return NextResponse.json({ ok: true, study: data });
}
