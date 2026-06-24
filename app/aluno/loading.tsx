import { AppShell } from '@/components/app-shell';

export default function StudentLoading() {
  return (
    <AppShell>
      <main className="student-page-skeleton" aria-label="Carregando área do aluno">
        <div className="skeleton-card student-skeleton-hero" />
        <div className="student-skeleton-row" aria-hidden>
          <div className="skeleton-card student-skeleton-card" />
          <div className="skeleton-card student-skeleton-card" />
          <div className="skeleton-card student-skeleton-card" />
        </div>
        <div className="skeleton-card student-skeleton-feed" />
      </main>
    </AppShell>
  );
}
