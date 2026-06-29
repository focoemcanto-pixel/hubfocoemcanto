'use client';

import { useEffect } from 'react';

export function OnboardingReturnGuard() {
  useEffect(() => {
    const shouldWatch = window.location.pathname === '/aluno/perfil-vocal'
      && new URLSearchParams(window.location.search).get('from') === 'onboarding';
    if (!shouldWatch) return;

    let redirected = false;
    const resume = () => {
      if (redirected) return;
      const text = document.body.textContent || '';
      if (!text.includes('Mapa Vocal salvo no seu perfil.')) return;
      redirected = true;
      window.localStorage.setItem('hub_onboarding_step_v1', 'profile');
      window.setTimeout(() => {
        window.location.href = '/aluno/onboarding?step=profile';
      }, 650);
    };

    resume();
    const observer = new MutationObserver(resume);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
