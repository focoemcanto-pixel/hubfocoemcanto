import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import '../app-premium.css';

export const dynamic = 'force-dynamic';

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();

  if (!cookieStore.get('hub_access_email')?.value) {
    redirect('/login');
  }

  return children;
}
