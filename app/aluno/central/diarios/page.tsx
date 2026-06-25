import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DailyTrainingEntryPage() {
  redirect('/aluno/central/diarios/1');
}
