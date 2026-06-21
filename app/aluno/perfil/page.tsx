import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type SubmissionRow = {
  id: string;
  file_url: string | null;
  status: string | null;
  note: string | null;
  visibility: string | null;
  created_at: string | null;
  updated_at: string | null;
  exercise_id: string | null;
};

type ReviewRow = {
  id: string;
  submission_id: string;
  rating: number | null;
  pitch_rating: number | null;
  rhythm_rating: number | null;
  harmony_rating: number | null;
  confidence_rating: number | null;
  comment: string | null;
  created_at: string | null;
};

type ExerciseRow = {
  id: string;
  title: string | null;
  slug: string | null;
  module_id: string | null;
};

type ModuleRow = {
  id: string;
  title: string | null;
  slug: string | null;
};

function statusLabel(status?: string | null) {
  if (status === 'approved') return 'Aprovada';
  if (status === 'needs_rework') return 'Refazer';
  if (status === 'reviewed') return 'Avaliada';
  return 'Aguardando avaliação';
}

function statusClass(status?: string | null) {
  if (status === 'approved') return '#44d17a';
  if (status === 'needs_rework') return '#ff6b6b';
  if (status === 'reviewed') return '#ffd166';
  return '#9aa0b6';
}

function averageReview(review?: ReviewRow) {
  if (!review) return null;
  const values = [review.rating, review.pitch_rating, review.rhythm_rating, review.harmony_rating, review.confidence_rating]
    .filter((value): value is number => typeof value === 'number' && value > 0);
  if (!values.length) return null;
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const cookieStore = await cookies();
  const { data: { user } } = await supabase.auth.getUser();
  const accessEmail = cookieStore.get('hub_access_email')?.value || user?.email || '';

  const { data: profile } = accessEmail
    ? await admin.from('profiles').select('*').eq('email', accessEmail).maybeSingle()
    : user
      ? await admin.from('profiles').select('*').eq('auth_user_id', user.id).maybeSingle()
      : { data: null };

  const profileId = profile?.id;

  const { data: submissionsData } = profileId
    ? await admin
        .from('submissions')
        .select('id,file_url,status,note,visibility,created_at,updated_at,exercise_id')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
    : { data: [] };

  const submissions = (submissionsData || []) as SubmissionRow[];
  const submissionIds = submissions.map((item) => item.id);
  const exerciseIds = Array.from(new Set(submissions.map((item) => item.exercise_id).filter(Boolean))) as string[];

  const { data: reviewsData } = submissionIds.length
    ? await admin
        .from('reviews')
        .select('id,submission_id,rating,pitch_rating,rhythm_rating,harmony_rating,confidence_rating,comment,created_at')
        .in('submission_id', submissionIds)
        .order('created_at', { ascending: false })
    : { data: [] };

  const reviews = (reviewsData || []) as ReviewRow[];
  const reviewBySubmission = new Map<string, ReviewRow>();
  for (const review of reviews) {
    if (!reviewBySubmission.has(review.submission_id)) reviewBySubmission.set(review.submission_id, review);
  }

  const { data: exercisesData } = exerciseIds.length
    ? await admin.from('exercises').select('id,title,slug,module_id').in('id', exerciseIds)
    : { data: [] };

  const exercises = (exercisesData || []) as ExerciseRow[];
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const moduleIds = Array.from(new Set(exercises.map((exercise) => exercise.module_id).filter(Boolean))) as string[];

  const { data: modulesData } = moduleIds.length
    ? await admin.from('modules').select('id,title,slug').in('id', moduleIds)
    : { data: [] };

  const moduleById = new Map(((modulesData || []) as ModuleRow[]).map((module) => [module.id, module]));
  const reviewedCount = submissions.filter((item) => reviewBySubmission.has(item.id)).length;
  const approvedCount = submissions.filter((item) => item.status === 'approved').length;
  const pendingCount = submissions.filter((item) => item.status === 'pending_review').length;
  const reviewAverages = reviews.map(averageReview).filter((value): value is string => Boolean(value)).map(Number);
  const generalAverage = reviewAverages.length ? (reviewAverages.reduce((sum, value) => sum + value, 0) / reviewAverages.length).toFixed(1) : '—';

  return (
    <AppShell>
      <main className="page">
        <section className="card profile-hero-card">
          <p className="eyebrow">Meu perfil</p>
          <h1 className="hero-title">{profile?.name || 'Aluno VIP'}</h1>
          <p className="muted">{profile?.email || accessEmail}</p>
          <div className="grid" style={{ marginTop: 20 }}>
            <article className="card"><p className="stat">{submissions.length}</p><p className="muted">atividades enviadas</p></article>
            <article className="card"><p className="stat">{reviewedCount}</p><p className="muted">avaliações recebidas</p></article>
            <article className="card"><p className="stat">{generalAverage}</p><p className="muted">média geral</p></article>
            <article className="card"><p className="stat">{pendingCount}</p><p className="muted">aguardando professor</p></article>
          </div>
        </section>

        <section className="card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <p className="eyebrow">Correções do professor</p>
              <h2>Minhas avaliações</h2>
              <p className="muted">Veja seus duetos enviados, comentários e notas recebidas.</p>
            </div>
            <div className="pill">{approvedCount} aprovadas</div>
          </div>

          <div style={{ display: 'grid', gap: 14, marginTop: 22 }}>
            {submissions.length ? submissions.map((submission) => {
              const review = reviewBySubmission.get(submission.id);
              const exercise = submission.exercise_id ? exerciseById.get(submission.exercise_id) : null;
              const module = exercise?.module_id ? moduleById.get(exercise.module_id) : null;
              const avg = averageReview(review);

              return (
                <article key={submission.id} className="card" style={{ padding: 18 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 280px) 1fr', gap: 18, alignItems: 'start' }}>
                    <div>
                      {submission.file_url ? (
                        <video src={submission.file_url} controls playsInline style={{ width: '100%', borderRadius: 18, background: '#050505', border: '1px solid rgba(255,255,255,.12)' }} />
                      ) : (
                        <div className="card" style={{ minHeight: 150 }}>Vídeo indisponível</div>
                      )}
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <p className="eyebrow">{module?.title || 'Módulo'}</p>
                          <h3 style={{ margin: '6px 0 4px' }}>{exercise?.title || 'Atividade enviada'}</h3>
                          <p className="muted">Enviado em {formatDate(submission.created_at)}</p>
                        </div>
                        <span className="pill" style={{ borderColor: statusClass(submission.status), color: statusClass(submission.status) }}>{statusLabel(submission.status)}</span>
                      </div>

                      {review ? (
                        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                          <div className="grid">
                            <article className="card"><p className="stat">{avg || '—'}</p><p className="muted">nota média</p></article>
                            <article className="card"><p className="stat">{review.pitch_rating || '—'}</p><p className="muted">afinação</p></article>
                            <article className="card"><p className="stat">{review.rhythm_rating || '—'}</p><p className="muted">ritmo</p></article>
                            <article className="card"><p className="stat">{review.harmony_rating || '—'}</p><p className="muted">segunda voz</p></article>
                          </div>
                          <div className="card" style={{ background: 'rgba(255, 209, 102, .08)', borderColor: 'rgba(255, 209, 102, .25)' }}>
                            <p className="eyebrow">Comentário do professor</p>
                            <p style={{ margin: 0 }}>{review.comment || 'Avaliação recebida sem comentário textual.'}</p>
                          </div>
                          {submission.status === 'needs_rework' && exercise?.slug ? (
                            <Link className="button" href={`/aluno/aula/${exercise.slug}`}>Refazer atividade</Link>
                          ) : null}
                        </div>
                      ) : (
                        <div className="card" style={{ marginTop: 16, background: 'rgba(255,255,255,.04)' }}>
                          <p className="eyebrow">Na fila</p>
                          <p className="muted" style={{ margin: 0 }}>Sua atividade foi enviada e está aguardando a correção do professor.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            }) : (
              <article className="card">
                <h3>Nenhuma atividade enviada ainda</h3>
                <p className="muted">Grave um dueto em uma aula para receber sua primeira avaliação.</p>
                <Link className="button" href="/aluno/biblioteca">Abrir biblioteca</Link>
              </article>
            )}
          </div>
        </section>

        <form action="/auth/logout" method="post" style={{ marginTop: 20 }}>
          <button className="button secondary" type="submit">Sair</button>
        </form>
      </main>
    </AppShell>
  );
}
