import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { AdaptiveDailyTrainingPlayer } from '@/components/adaptive-daily-training-player';
import { dailyTrainingSteps, getDailyTrainingExercise, getDailyTrainingStep } from '@/lib/training-center';
import { accessLabel, canAccessLevel, getCentralAccessRules, getEffectiveLevel, getStudentAccessContext } from '@/lib/central-access';

export const dynamic = 'force-dynamic';

const lockedCss = `.training-locked-page{min-height:100dvh;margin:-24px -16px 0;padding:calc(42px + env(safe-area-inset-top)) 22px calc(120px + env(safe-area-inset-bottom));display:grid;place-items:center;color:#fff;background:radial-gradient(circle at 70% 10%,rgba(245,199,107,.16),transparent 28%),linear-gradient(180deg,#111,#030304)}.training-locked-card{width:min(520px,100%);border:1px solid rgba(245,199,107,.24);border-radius:30px;background:linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.025));padding:30px;text-align:center}.training-locked-card span{display:inline-grid;place-items:center;width:64px;height:64px;border-radius:22px;background:rgba(245,199,107,.12);color:#f5c76b;font-size:30px}.training-locked-card h1{margin:18px 0 10px;font-size:36px;letter-spacing:-.05em}.training-locked-card p{color:rgba(255,255,255,.66);line-height:1.45}.training-locked-card a{display:inline-flex;margin-top:18px;border-radius:999px;background:#f5c76b;color:#140d04;text-decoration:none;font-weight:950;padding:14px 18px}`;
function LockedExercise({ level }: { level: string }) { return <AppShell hideNav><main className="training-locked-page"><style dangerouslySetInnerHTML={{ __html: lockedCss }} /><section className="training-locked-card"><span>🔒</span><h1>Exercício bloqueado</h1><p>Esta atividade diária está marcada como {accessLabel(level as any)} no painel administrativo.</p><a href="/aluno/central/diarios">Voltar aos diários</a></section></main></AppShell>; }

export default async function DailyExercisePage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const step = getDailyTrainingStep(Number(numero));
  if (!step) notFound();
  const exercise = getDailyTrainingExercise(step);
  if (!exercise) notFound();
  const [rules, ctx] = await Promise.all([getCentralAccessRules(), getStudentAccessContext()]);
  const level = getEffectiveLevel(rules, ['central', 'daily', `daily_step_${step.exerciseNumber}`, `exercise_${exercise.slug}`]);
  if (!canAccessLevel(level, ctx)) return <LockedExercise level={level} />;
  return <AppShell hideNav><main className="page" style={{ padding: 0 }}><AdaptiveDailyTrainingPlayer step={step} exercise={exercise} total={dailyTrainingSteps.length} /></main></AppShell>;
}
