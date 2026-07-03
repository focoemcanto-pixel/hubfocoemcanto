'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function eventForPath(path: string) {
  if (path.includes('/aluno/comunidade')) return 'community_open';
  if (path.includes('/aluno/biblioteca')) return 'library_open';
  if (path.includes('/aluno')) return 'feed_open';
  return 'page_view';
}

export function AnalyticsPageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || !pathname.startsWith('/aluno')) return;
    const payload = { event: eventForPath(pathname), screen: pathname, source: 'hub' };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/track', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/analytics/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => null);
  }, [pathname]);
  return null;
}
