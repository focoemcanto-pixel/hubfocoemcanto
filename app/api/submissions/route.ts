import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (!profile) return NextResponse.redirect(new URL('/aluno/enviar?erro=perfil', request.url));

  const exerciseId = String(formData.get('exercise_id') || '');
  const fileUrl = String(formData.get('file_url') || '');
  const note = String(formData.get('note') || '');
  const visibility = String(formData.get('visibility') || 'private');

  const { data: submission, error } = await supabase
    .from('submissions')
    .insert({ profile_id: profile.id, exercise_id: exerciseId, file_url: fileUrl, note, visibility })
    .select('id')
    .single();

  if (error || !submission) return NextResponse.redirect(new URL('/aluno/enviar?erro=envio', request.url));

  if (visibility === 'community') {
    await supabase.from('community_posts').insert({
      profile_id: profile.id,
      exercise_id: exerciseId,
      submission_id: submission.id,
      media_url: fileUrl,
      caption: note,
      category: 'atividade',
    });
  }

  return NextResponse.redirect(new URL('/aluno?sucesso=atividade-enviada', request.url));
}
