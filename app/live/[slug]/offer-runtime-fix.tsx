'use client';

import { useEffect } from 'react';

type Props = { slug: string };

function normalizeInternalOfferLink(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('api/live/')) return `/${trimmed}`;
  if (trimmed.startsWith('./api/live/')) return trimmed.slice(1);
  return trimmed;
}

export default function OfferRuntimeFix({ slug }: Props) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const isControlRequest = url.includes(`/api/live/${slug}/control`) && init?.method?.toUpperCase() === 'POST';

      if (isControlRequest && typeof init?.body === 'string') {
        try {
          const payload = JSON.parse(init.body);
          const statusText = document.querySelector('.fl-top-status')?.textContent || '';
          const isPreview = statusText.includes('ENCERRADA') || statusText.includes('PRÉ-SALA');

          if (payload?.action === 'offer' && isPreview) {
            return new Response(JSON.stringify({ preview: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        } catch {
          // Mantém o fetch original quando o corpo não for JSON.
        }
      }

      return originalFetch(input, init);
    };

    const repairLinks = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
        const raw = anchor.getAttribute('href');
        if (!raw) return;
        const normalized = normalizeInternalOfferLink(raw);
        if (normalized !== raw) anchor.setAttribute('href', normalized);
      });
    };

    const clickHandler = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!target) return;
      const raw = target.getAttribute('href');
      if (!raw) return;
      const normalized = normalizeInternalOfferLink(raw);
      if (normalized === raw) return;

      event.preventDefault();
      target.setAttribute('href', normalized);
      window.open(normalized, target.target === '_blank' ? '_blank' : '_self', 'noopener,noreferrer');
    };

    repairLinks();
    document.addEventListener('click', clickHandler, true);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) repairLinks(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.fetch = originalFetch;
      document.removeEventListener('click', clickHandler, true);
      observer.disconnect();
    };
  }, [slug]);

  return null;
}
