import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { PersonalizedExerciseShell } from '@/components/personalized-exercise-shell';
import { getTrainingCategory, getTrainingExercise } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

export default async function TrainingExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exercise = getTrainingExercise(slug);
  if (!exercise) notFound();
  const category = getTrainingCategory(exercise.categorySlug);

  return (
    <AppShell hideNav>
      <PersonalizedExerciseShell exercise={exercise} category={category} />
    </AppShell>
  );
}
