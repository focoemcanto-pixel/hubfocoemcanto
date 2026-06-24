import { StudentBottomNav } from '@/components/student-bottom-nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell student-app-shell">
      <main className="app-content route-surface student-route-surface">{children}</main>
      <StudentBottomNav />
    </div>
  );
}
