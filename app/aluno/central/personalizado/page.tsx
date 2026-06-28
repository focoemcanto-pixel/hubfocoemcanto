import Link from 'next/link';
import type { CSSProperties } from 'react';
import { AppShell } from '@/components/app-shell';
import { getExercisesByCategory, trainingCategories, trainingExercises } from '@/lib/training-center';

export const dynamic = 'force-dynamic';

type TrainingGradientStyle = CSSProperties & { '--training-gradient': string };

const css = `.personalized-center{max-width:1180px}`;

export default function PersonalizedTrainingPage() {
  return <AppShell><main className="page personalized-center"><style dangerouslySetInnerHTML={{ __html: css }} /><Link href="/aluno/central" prefetch>← Voltar</Link></main></AppShell>;
}
