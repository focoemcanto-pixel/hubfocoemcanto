import { AppShell } from '@/components/app-shell';
import { DailyProgressClient } from '@/components/daily-progress-client';

export const dynamic = 'force-dynamic';

export default function DailyProgressPage() {
  return (
    <AppShell hideNav>
      <main className="page" style={{ padding: 0 }}>
        <DailyProgressClient />
      </main>
    </AppShell>
  );
}
