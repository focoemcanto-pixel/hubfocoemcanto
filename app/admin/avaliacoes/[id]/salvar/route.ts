import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string }> };

function intValue(value: FormDataEntryValue | null) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const formData = await request.formData();
  const result = String(formData.get('result') || 'reviewed');
  const comment = String(formData.get('comment') || '').trim();
  const supabase = createAdminClient();

  const { error: reviewError } = await supabase.from('reviews').insert({
    submission_id: id,
    rating: intValue(formData.get('rating')),
    pitch_rating: intValue(formData.get('pitch_rating')),
    rhythm_rating: intValue(formData.get('rhythm_rating')),
    harmony_rating: intValue(formData.get('harmony_rating')),
    confidence_rating: intValue(formData.get('confidence_rating')),
    comment,
  });

  if (reviewError) {
    return NextResponse.redirect(new URL(`/admin/avaliacoes/${id}?erro=${encodeURIComponent(reviewError.message)}`, request.url));
  }

  const nextStatus = result === 'needs_rework' ? 'needs_rework' : result === 'approved' ? 'approved' : 'reviewed';
  await supabase.from('submissions').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', id);

  const { data: submission } = await supabase
    .from('submissions')
    .select('id,profile_id,exercise_id,file_url,note,visibility')
    .eq('id', id)
    .maybeSingle();

  if (nextStatus === 'approved' && submission?.visibility === 'community') {
    const { data: existingPost } = await supabase
      .from('community_posts')
      .select('id')
      .eq('submission_id', id)
      .maybeSingle();

    if (!existingPost?.id) {
      await supabase.from('community_posts').insert({
        profile_id: submission.profile_id,
        exercise_id: submission.exercise_id,
        submission_id: submission.id,
        media_url: submission.file_url,
        caption: submission.note,
        category: 'atividade',
      });
    }
  }

  return NextResponse.redirect(new URL(`/admin/avaliacoes/${id}?sucesso=avaliado`, request.url));
}
