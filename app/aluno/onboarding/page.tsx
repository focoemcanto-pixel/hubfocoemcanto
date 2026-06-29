import { AppShell } from '@/components/app-shell';
import { StudentOnboarding } from '@/components/student-onboarding';

export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  return <AppShell hideNav><StudentOnboarding /></AppShell>;
}
