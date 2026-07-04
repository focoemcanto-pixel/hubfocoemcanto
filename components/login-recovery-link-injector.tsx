'use client';

import { useEffect } from 'react';

export function LoginRecoveryLinkInjector() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('password') !== '1') return;
    if (document.querySelector('[data-recovery-link-injected="1"]')) return;
    const form = document.querySelector<HTMLFormElement>('form[action="/auth/login"]');
    if (!form) return;
    const email = params.get('email') || '';
    const link = document.createElement('a');
    link.href = `/recuperar-senha${email ? `?email=${encodeURIComponent(email)}` : ''}`;
    link.textContent = 'Esqueci minha senha';
    link.setAttribute('data-recovery-link-injected', '1');
    link.style.display = 'inline-flex';
    link.style.marginTop = '12px';
    link.style.color = '#f5c76b';
    link.style.fontWeight = '900';
    link.style.textDecoration = 'none';
    form.appendChild(link);
  }, []);
  return null;
}
