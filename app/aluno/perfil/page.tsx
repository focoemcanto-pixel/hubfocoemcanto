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

type ExerciseRow = { id: string; title: string | null; slug: string | null; module_id: string | null };
type ModuleRow = { id: string; title: string | null; slug: string | null };

function statusLabel(status?: string | null) {
  if (status === 'approved') return 'Aprovada';
  if (status === 'needs_rework') return 'Refazer';
  if (status === 'reviewed') return 'Avaliada';
  return 'Aguardando';
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

function initials(name?: string | null) {
  return String(name || 'Aluno VIP').trim().split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
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

  const profileAny = (profile || {}) as any;
  const profileId = profileAny?.id;
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
  const reworkCount = submissions.filter((item) => item.status === 'needs_rework').length;
  const reviewAverages = reviews.map(averageReview).filter((value): value is string => Boolean(value)).map(Number);
  const generalAverage = reviewAverages.length ? (reviewAverages.reduce((sum, value) => sum + value, 0) / reviewAverages.length).toFixed(1) : '—';
  const firstName = String(profileAny?.name || 'Aluno VIP').split(' ')[0];
  const nextRework = submissions.find((item) => item.status === 'needs_rework');
  const nextPending = submissions.find((item) => item.status === 'pending_review');
  const nextSuggestionExercise = nextRework?.exercise_id ? exerciseById.get(nextRework.exercise_id) : null;

  const suggestion = nextRework
    ? {
        label: 'Correção disponível',
        title: 'Refaça esta atividade com atenção ao feedback.',
        text: 'Existe uma atividade marcada para refazer. Abra a aula, assista novamente a referência e grave uma nova versão com mais segurança.',
        href: nextSuggestionExercise?.slug ? `/aluno/atividade/${nextSuggestionExercise.slug}` : '/aluno/biblioteca',
        cta: 'Refazer agora',
      }
    : nextPending
      ? {
          label: 'Na fila do professor',
          title: 'Sua próxima avaliação está em andamento.',
          text: 'Enquanto aguarda a correção, continue treinando outra aula do módulo para manter constância vocal.',
          href: '/aluno/biblioteca',
          cta: 'Continuar treinando',
        }
      : submissions.length
        ? {
            label: 'Próximo passo',
            title: 'Você já tem avaliações. Agora avance para uma nova prática.',
            text: 'Escolha uma aula, grave outro dueto e acompanhe a evolução da sua afinação, ritmo e segurança.',
            href: '/aluno/biblioteca',
            cta: 'Abrir biblioteca',
          }
        : {
            label: 'Comece por aqui',
            title: 'Envie sua primeira atividade para receber avaliação.',
            text: 'Grave um dueto em uma aula publicada no Hub. Seu envio aparecerá aqui com status, nota e comentário do professor.',
            href: '/aluno/biblioteca',
            cta: 'Escolher primeira aula',
          };

  return (
    <AppShell>
      <main className="student-profile-page">
        <section className="profile-premium-hero">
          <div className="profile-hero-grid">
            <div className="profile-avatar-large">
              {profileAny?.avatar_url ? <img src={profileAny.avatar_url} alt={profileAny?.name || 'Aluno'} /> : initials(profileAny?.name)}
            </div>
            <div>
              <span className="profile-vip-badge">★ Aluno VIP</span>
              <h1>{profileAny?.name || 'Aluno VIP'}</h1>
              <p className="profile-headline">{profileAny?.headline || 'Minha jornada vocal dentro do Foco em Canto.'}</p>
              <p className="profile-bio-preview">{profileAny?.bio || 'Adicione uma bio para contar um pouco sobre sua voz, seus objetivos e o que você está treinando agora.'}</p>
            </div>
            <div className="profile-score-orb">
              <div><strong>{generalAverage}</strong><span>média geral</span></div>
            </div>
          </div>

          <div className="profile-stats-row">
            <article className="profile-stat-card"><strong>{submissions.length}</strong><span>atividades enviadas</span></article>
            <article className="profile-stat-card"><strong>{reviewedCount}</strong><span>avaliações recebidas</span></article>
            <article className="profile-stat-card"><strong>{approvedCount}</strong><span>aprovadas</span></article>
            <article className="profile-stat-card"><strong>{pendingCount}</strong><span>aguardando professor</span></article>
          </div>
        </section>

        <section className="profile-body-grid">
          <aside>
            <section className="profile-edit-card">
              <p className="eyebrow">Editar perfil</p>
              <h2>Seu cartão de aluno</h2>
              <p className="muted">Essas informações aparecem no seu perfil e ajudam a personalizar sua presença na comunidade.</p>

              <form className="profile-form" action="/api/profile" method="post" encType="multipart/form-data">
                <label>
                  Foto de perfil
                  <div className="profile-upload-box">
                    <strong>Subir nova foto</strong>
                    <span className="muted">Use uma imagem quadrada para melhor resultado.</span>
                    <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" />
                  </div>
                </label>
                <label>Nome<input name="name" defaultValue={profileAny?.name || ''} placeholder="Seu nome" /></label>
                <label>Headline<input name="headline" defaultValue={profileAny?.headline || ''} placeholder="Ex: Aprendendo segunda voz com segurança" /></label>
                <label>WhatsApp<input name="whatsapp" defaultValue={profileAny?.whatsapp || ''} placeholder="Opcional" /></label>
                <label>Bio<textarea name="bio" defaultValue={profileAny?.bio || ''} placeholder="Conte sobre sua jornada vocal, objetivos e maior desafio atual..." /></label>
                <button className="profile-save-button" type="submit">Salvar perfil</button>
              </form>
            </section>

            <form className="profile-logout" action="/auth/logout" method="post">
              <button type="submit">Sair da conta</button>
            </form>
          </aside>

          <section>
            <article className="profile-suggestion-card">
              <span className="suggestion-meta">{suggestion.label}</span>
              <h2>{suggestion.title}</h2>
              <p className="muted">{suggestion.text}</p>
              <div className="suggestion-actions">
                <Link className="primary" href={suggestion.href}>{suggestion.cta}</Link>
                <Link href="/aluno/comunidade">Abrir comunidade</Link>
              </div>
            </article>

            <section className="profile-reviews-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <p className="eyebrow">Status das avaliações</p>
                  <h2>Minhas correções</h2>
                  <p className="muted">Acompanhe cada envio, notas, comentários e pedidos de ajuste.</p>
                </div>
                <span className="profile-vip-badge">{approvedCount} aprovadas</span>
              </div>

              <div className="review-status-tabs">
                <article className="review-status-pill"><strong>{pendingCount}</strong><span>aguardando</span></article>
                <article className="review-status-pill"><strong>{reviewedCount}</strong><span>avaliadas</span></article>
                <article className="review-status-pill"><strong>{reworkCount}</strong><span>para refazer</span></article>
              </div>

              <div className="premium-review-list">
                {submissions.length ? submissions.map((submission) => {
                  const review = reviewBySubmission.get(submission.id);
                  const exercise = submission.exercise_id ? exerciseById.get(submission.exercise_id) : null;
                  const module = exercise?.module_id ? moduleById.get(exercise.module_id) : null;
                  const avg = averageReview(review);

                  return (
                    <details key={submission.id} className="premium-review-item">
                      <summary className="premium-review-summary">
                        <video className="premium-review-thumb" src={submission.file_url || ''} muted playsInline preload="metadata" />
                        <div className="premium-review-title">
                          <p className="eyebrow" style={{ marginBottom: 4 }}>{module?.title || 'Módulo'}</p>
                          <strong>{exercise?.title || 'Atividade enviada'}</strong>
                          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{formatDate(submission.created_at)} · {avg ? `nota ${avg}` : 'sem nota ainda'}</p>
                        </div>
                        <span className="premium-status-badge" style={{ color: statusClass(submission.status) }}>{statusLabel(submission.status)}</span>
                      </summary>

                      <div className="premium-review-body">
                        <video src={submission.file_url || ''} controls playsInline />
                        <div>
                          {review ? (
                            <>
                              <div className="review-score-grid">
                                <article className="review-score-card"><strong>{avg || '—'}</strong><span>média</span></article>
                                <article className="review-score-card"><strong>{review.pitch_rating || '—'}</strong><span>afinação</span></article>
                                <article className="review-score-card"><strong>{review.rhythm_rating || '—'}</strong><span>ritmo</span></article>
                                <article className="review-score-card"><strong>{review.harmony_rating || '—'}</strong><span>2ª voz</span></article>
                                <article className="review-score-card"><strong>{review.confidence_rating || '—'}</strong><span>segurança</span></article>
                              </div>
                              <div className="teacher-comment-box">
                                <p className="eyebrow">Comentário do professor</p>
                                <p style={{ margin: 0 }}>{review.comment || 'Avaliação recebida sem comentário textual.'}</p>
                              </div>
                              {submission.status === 'needs_rework' && exercise?.slug ? <div className="suggestion-actions"><Link className="primary" href={`/aluno/atividade/${exercise.slug}`}>Refazer atividade</Link></div> : null}
                            </>
                          ) : (
                            <div className="teacher-comment-box">
                              <p className="eyebrow">Na fila</p>
                              <p className="muted" style={{ margin: 0 }}>Aguardando a correção do professor.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </details>
                  );
                }) : (
                  <article className="empty-profile-state">
                    <h3>Nenhuma atividade enviada ainda</h3>
                    <p className="muted">Grave um dueto em uma aula para receber sua primeira avaliação.</p>
                    <div className="suggestion-actions" style={{ justifyContent: 'center' }}><Link className="primary" href="/aluno/biblioteca">Abrir biblioteca</Link></div>
                  </article>
                )}
              </div>
            </section>
          </section>
        </section>
      </main>
    </AppShell>
  );
}
