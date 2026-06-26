import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { AdaptiveDailyTrainingPlayer } from '@/components/adaptive-daily-training-player';
import { dailyTrainingSteps, getDailyTrainingExercise, getDailyTrainingStep } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

export default async function DailyExercisePage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const step = getDailyTrainingStep(Number(numero));
  if (!step) notFound();
  const exercise = getDailyTrainingExercise(step);
  if (!exercise) notFound();

  return (
    <AppShell hideNav>
      <main className="page" style={{ padding: 0 }}>
        <AdaptiveDailyTrainingPlayer step={step} exercise={exercise} total={dailyTrainingSteps.length} />
      </main>
    </AppShell>
  );
}
