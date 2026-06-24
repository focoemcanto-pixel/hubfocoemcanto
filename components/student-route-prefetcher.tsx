'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STUDENT_ROUTES = [
  '/aluno',
  '/aluno/biblioteca',
  '/aluno/comunidade',
  '/aluno/perfil',
  '/aluno/avaliacoes',
  '/aluno/salvos',
];

export function StudentRoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefetchRoutes = () => {
      STUDENT_ROUTES.forEach((route) => {
        try {
          router.prefetch(route);
        } catch {
          // Next can safely ignore unavailable routes during prefetch.
        }
      });
    };

    const runWhenIdle = 'requestIdleCallback' in window
      ? window.requestIdleCallback(prefetchRoutes, { timeout: 1800 })
      : window.setTimeout(prefetchRoutes, 700);

    return () => {
      if ('cancelIdleCallback' in window && typeof runWhenIdle === 'number') {
        window.cancelIdleCallback(runWhenIdle);
      } else if (typeof runWhenIdle === 'number') {
        window.clearTimeout(runWhenIdle);
      }
    };
  }, [router]);

  return null;
}
