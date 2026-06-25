'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const ESSENTIAL_ROUTES = ['/aluno/biblioteca', '/aluno/central', '/aluno/comunidade'];

type WindowWithIdleCallback = Window & typeof globalThis & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function shouldSkipBackgroundPrefetch() {
  if (typeof window === 'undefined') return true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const isSmallScreen = window.matchMedia('(max-width: 760px)').matches;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isSlowConnection = Boolean(connection?.saveData) || ['slow-2g', '2g', '3g'].includes(String(connection?.effectiveType || ''));
  return isSlowConnection || (isSmallScreen && isCoarsePointer);
}

export function StudentRoutePrefetcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (shouldSkipBackgroundPrefetch()) return;

    const browserWindow = window as WindowWithIdleCallback;

    const prefetchRoutes = () => {
      ESSENTIAL_ROUTES.filter((route) => route !== pathname).forEach((route) => {
        try {
          router.prefetch(route);
        } catch {
          // Next can safely ignore unavailable routes during prefetch.
        }
      });
    };

    const runWhenIdle = typeof browserWindow.requestIdleCallback === 'function'
      ? browserWindow.requestIdleCallback(prefetchRoutes, { timeout: 2200 })
      : browserWindow.setTimeout(prefetchRoutes, 1200);

    return () => {
      if (typeof browserWindow.cancelIdleCallback === 'function') {
        browserWindow.cancelIdleCallback(runWhenIdle);
      } else {
        browserWindow.clearTimeout(runWhenIdle);
      }
    };
  }, [pathname, router]);

  return null;
}
