import Link from 'next/link';
import { cookies } from 'next/headers';
import { ChevronLeft } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';

type SubmissionRow = { id: string; file_url: string | null; status: string | null; created_at: string | null; exercise_id: string | null };
type ReviewRow = { id: string; submission_id: string; rating: number | null; pitch_rating: number | null; rhythm_rating: number | null; harmony_rating: number | null; confidence_rating: number | null; comment: string | null; created_at: string | null };
type ExerciseRow = { id: string; title: string | null; slug: string | null; module_id: string | null };
type ModuleRow = { id: string; title: string | null };

export const dynamic = 'force-dynamic';

function statusLabel(status?: string | null) {
  if (status === 'approved') return 'Aprovada';
  if (status === 'needs_rework') return 'Refazer';
  if (status === 'reviewed') return 'Avaliada';
  return 'Aguardando';
}

function averageReview(review?: ReviewRow) {
  if (!review) return null;
  const values = [review.rating, review.pitch_rating, review.rhythm_rating, review.harmony_rating, review.confidence_rating].filter((value): value is number => typeof value === 'number' && value > 0);
  if (!values.length) return null;
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(value));
}

export default async function StudentReviewsPage() {
  const email = (await cookies()).get('hub_access_email')?.value || '';
  const admin = createAdminClient();
  const { data: profile } = email ? await admin.from('profiles').select('id,name,email').eq('email', email).maybeSingle() : { data: null };
  const profileId = (profile as any)?.id;

  const { data: submissionsData } = profileId
    ? await admin.from('submissions').select('id,file_url,status,created_at,exercise_id').eq('profile_id', profileId).order('created_at', { ascending: false })
    : { data: [] };

  const submissions = (submissionsData || []) as SubmissionRow[];
  const submissionIds = submissions.map((item) => item.id);
  const exerciseIds = Array.from(new Set(submissions.map((item) => item.exercise_id).filter(Boolean))) as string[];

  const { data: reviewsData } = submissionIds.length
    ? await admin.from('reviews').select('id,submission_id,rating,pitch_rating,rhythm_rating,harmony_rating,confidence_rating,comment,created_at').in('submission_id', submissionIds).order('created_at', { ascending: false })
    : { data: [] };
  const reviews = (reviewsData || []) as ReviewRow[];
  const reviewBySubmission = new Map<string, ReviewRow>();
  for (const review of reviews) if (!reviewBySubmission.has(review.submission_id)) reviewBySubmission.set(review.submission_id, review);

  const { data: exercisesData } = exerciseIds.length ? await admin.from('exercises').select('id,title,slug,module_id').in('id', exerciseIds) : { data: [] };
  const exercises = (exercisesData || []) as ExerciseRow[];
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const moduleIds = Array.from(new Set(exercises.map((exercise) => exercise.module_id).filter(Boolean))) as string[];
  const { data: modulesData } = moduleIds.length ? await admin.from('modules').select('id,title').in('id', moduleIds) : { data: [] };
  const moduleById = new Map(((modulesData || []) as ModuleRow[]).map((module) => [module.id, module]));

  return (
    <AppShell>
      <main className="ig-reviews-page">
        <header className="ig-edit-topbar">
          <a href="/aluno/perfil"><ChevronLeft size={24} /> Perfil</a>
          <strong>Minhas avaliações</strong>
          <span />
        </header>

        <section className="ig-reviews-hero">
          <p className="eyebrow">Correções do professor</p>
          <h1>Seu histórico vocal</h1>
          <p>Veja suas atividades, notas e comentários em uma lista compacta para acompanhar a evolução.</p>
        </section>

        <section className="ig-review-list">
          {submissions.length ? submissions.map((submission) => {
            const review = reviewBySubmission.get(submission.id);
            const exercise = submission.exercise_id ? exerciseById.get(submission.exercise_id) : null;
            const module = exercise?.module_id ? moduleById.get(exercise.module_id) : null;
            const avg = averageReview(review);
            return (
              <details className="ig-review-item" key={submission.id}>
                <summary>
                  <video src={submission.file_url || ''} muted playsInline preload="metadata" />
                  <div><strong>{exercise?.title || 'Atividade enviada'}</strong><span>{module?.title || 'Módulo'} · {formatDate(submission.created_at)}</span></div>
                  <b>{avg || statusLabel(submission.status)}</b>
                </summary>
                <div className="ig-review-open">
                  <video src={submission.file_url || ''} controls playsInline />
                  {review ? (
                    <div>
                      <div className="ig-review-scores"><span>{avg || '—'}<small>média</small></span><span>{review.pitch_rating || '—'}<small>afinação</small></span><span>{review.rhythm_rating || '—'}<small>ritmo</small></span><span>{review.harmony_rating || '—'}<small>2ª voz</small></span></div>
                      <p><strong>Professor:</strong> {review.comment || 'Avaliação recebida sem comentário textual.'}</p>
                    </div>
                  ) : <p>Aguardando a correção do professor.</p>}
                  {submission.status === 'needs_rework' && exercise?.slug ? <Link className="ig-review-redo" href={`/aluno/atividade/${exercise.slug}`}>Refazer atividade</Link> : null}
                </div>
              </details>
            );
          }) : (
            <div className="empty-community-feed"><h3>Nenhuma atividade enviada ainda.</h3><p>Grave um dueto para receber sua primeira avaliação.</p><Link className="premium-button gold" href="/aluno/biblioteca">Abrir biblioteca</Link></div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
