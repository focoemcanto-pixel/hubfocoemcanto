'use client';

import { useEffect } from 'react';
import { DuetRecorder as BaseDuetRecorder } from '@/components/duet-recorder';

type Props = Parameters<typeof BaseDuetRecorder>[0];

const SYSTEM_DUET_CAPTIONS = new Set([
  'minha prática do dueto.',
  'minha pratica do dueto.',
  'compartilhou uma prática.',
  'compartilhou uma pratica.',
  'prática vocal.',
  'pratica vocal.',
  'novo dueto.',
]);

function cleanCaption(value: unknown) {
  const text = String(value || '').trim();
  return SYSTEM_DUET_CAPTIONS.has(text.toLowerCase()) ? '' : text;
}

function cleanFormData(body: BodyInit | null | undefined) {
  if (!(body instanceof FormData)) return;
  const current = cleanCaption(body.get('caption'));
  body.set('caption', current);
}

function cleanJsonBody(init: RequestInit | undefined) {
  if (!init?.body || typeof init.body !== 'string') return;
  try {
    const json = JSON.parse(init.body);
    if ('caption' in json) {
      json.caption = cleanCaption(json.caption);
      init.body = JSON.stringify(json);
    }
  } catch {
    // mantém o body original
  }
}

function clearDefaultTextareaValue() {
  const textareas = Array.from(document.querySelectorAll('textarea'));
  for (const textarea of textareas) {
    if (cleanCaption((textarea as HTMLTextAreaElement).value) === '') {
      const element = textarea as HTMLTextAreaElement;
      if (!element.value) continue;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(element, '');
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

export function DuetRecorder(props: Props) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/submissions/duet') || url.includes('/api/duet-render/jobs')) {
        cleanFormData(init?.body || null);
        cleanJsonBody(init);
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;

    const interval = window.setInterval(clearDefaultTextareaValue, 250);
    window.setTimeout(clearDefaultTextareaValue, 50);
    window.setTimeout(clearDefaultTextareaValue, 500);

    return () => {
      window.fetch = originalFetch;
      window.clearInterval(interval);
    };
  }, []);

  return <BaseDuetRecorder {...props} />;
}
