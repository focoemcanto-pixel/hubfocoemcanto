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

type WindowWithIdleCallback = Window & typeof globalThis & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function StudentRoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const browserWindow = window as WindowWithIdleCallback;

    const prefetchRoutes = () => {
      STUDENT_ROUTES.forEach((route) => {
        try {
          router.prefetch(route);
        } catch {
          // Next can safely ignore unavailable routes during prefetch.
        }
      });
    };

    const runWhenIdle = typeof browserWindow.requestIdleCallback === 'function'
      ? browserWindow.requestIdleCallback(prefetchRoutes, { timeout: 1800 })
      : browserWindow.setTimeout(prefetchRoutes, 700);

    return () => {
      if (typeof browserWindow.cancelIdleCallback === 'function') {
        browserWindow.cancelIdleCallback(runWhenIdle);
      } else {
        browserWindow.clearTimeout(runWhenIdle);
      }
    };
  }, [router]);

  return null;
}
