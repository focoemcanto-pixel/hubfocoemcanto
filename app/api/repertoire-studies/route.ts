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

const UpdateStudySchema = StudySchema.extend({
  id: z.string().uuid(),
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

function buildPayload(profileId: string, data: z.infer<typeof StudySchema>, youtubeVideoId: string) {
  return {
    profile_id: profileId,
    song_name: data.songName,
    youtube_url: data.youtubeUrl,
    youtube_video_id: youtubeVideoId,
    original_key: data.originalKey,
    study_key: data.studyKey,
    semitone_transposition: data.semitoneTransposition,
    bpm: data.bpm || null,
    notes: data.notes || null,
    summary: data.summary || null,
    updated_at: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  const parsed = StudySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Preencha música, link do YouTube e controles do estudo.' }, { status: 400 });

  const youtubeVideoId = extractYouTubeId(parsed.data.youtubeUrl);
  if (!youtubeVideoId) return NextResponse.json({ ok: false, message: 'Informe um link válido do YouTube.' }, { status: 400 });

  const { profileId, error: profileError } = await getProfileId();
  if (!profileId) return NextResponse.json({ ok: false, message: profileError }, { status: 401 });

  const supabase = createAdminClient();
  const payload = buildPayload(profileId, parsed.data, youtubeVideoId);

  const { data: existing } = await supabase
    .from('repertoire_studies')
    .select('id')
    .eq('profile_id', profileId)
    .eq('youtube_video_id', youtubeVideoId)
    .ilike('song_name', parsed.data.songName)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase.from('repertoire_studies').update(payload).eq('id', existing.id).eq('profile_id', profileId).select('*').single();
    if (error) return NextResponse.json({ ok: false, message: 'Não foi possível atualizar o estudo existente.', error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, study: data, mode: 'updated-existing' });
  }

  const { data, error } = await supabase.from('repertoire_studies').insert(payload).select('*').single();
  if (error) return NextResponse.json({ ok: false, message: 'Não foi possível salvar o estudo.', error: error.message, sql: 'supabase/migrations/20260627_create_repertoire_studies.sql' }, { status: 500 });
  return NextResponse.json({ ok: true, study: data, mode: 'created' });
}

export async function PUT(request: Request) {
  const parsed = UpdateStudySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Não foi possível atualizar. Confira os dados do estudo.' }, { status: 400 });

  const youtubeVideoId = extractYouTubeId(parsed.data.youtubeUrl);
  if (!youtubeVideoId) return NextResponse.json({ ok: false, message: 'Informe um link válido do YouTube.' }, { status: 400 });

  const { profileId, error: profileError } = await getProfileId();
  if (!profileId) return NextResponse.json({ ok: false, message: profileError }, { status: 401 });

  const { id, ...studyData } = parsed.data;
  const supabase = createAdminClient();
  const payload = buildPayload(profileId, studyData, youtubeVideoId);
  const { data, error } = await supabase.from('repertoire_studies').update(payload).eq('id', id).eq('profile_id', profileId).select('*').single();

  if (error) return NextResponse.json({ ok: false, message: 'Não foi possível atualizar este estudo.', error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, study: data, mode: 'updated' });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, message: 'Estudo não informado.' }, { status: 400 });

  const { profileId, error: profileError } = await getProfileId();
  if (!profileId) return NextResponse.json({ ok: false, message: profileError }, { status: 401 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('repertoire_studies').delete().eq('id', id).eq('profile_id', profileId);
  if (error) return NextResponse.json({ ok: false, message: 'Não foi possível excluir este estudo.', error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deletedId: id });
}
