'use client';

import { useEffect } from 'react';

type WatchRule = {
  path: string;
  successText: string;
  nextStep: string;
};

const rules: WatchRule[] = [
  { path: '/aluno/perfil-vocal', successText: 'Mapa Vocal salvo no seu perfil.', nextStep: 'profile' },
  { path: '/aluno/perfil/editar', successText: 'Perfil salvo. As alterações já foram aplicadas.', nextStep: 'tour' },
];

export function OnboardingReturnGuard() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') !== 'onboarding') return;

    const rule = rules.find((item) => window.location.pathname === item.path);
    if (!rule) return;

    let redirected = false;
    const resume = () => {
      if (redirected) return;
      const text = document.body.textContent || '';
      if (!text.includes(rule.successText)) return;
      redirected = true;
      window.localStorage.setItem('hub_onboarding_step_v1', rule.nextStep);
      window.setTimeout(() => {
        window.location.href = `/aluno/onboarding?step=${rule.nextStep}`;
      }, 650);
    };

    resume();
    const observer = new MutationObserver(resume);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
