'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type WatchRule = {
  path: string;
  successText: string;
  nextStep: string;
  currentStep: string;
  title: string;
  description: string;
};

const rules: WatchRule[] = [
  { path: '/aluno/perfil-vocal', successText: 'Mapa Vocal salvo no seu perfil.', currentStep: 'vocal', nextStep: 'profile', title: 'Mapa Vocal salvo', description: 'Sua voz já foi configurada. Agora vamos completar seu perfil para personalizar sua experiência.' },
  { path: '/aluno/perfil/editar', successText: 'Perfil salvo. As alterações já foram aplicadas.', currentStep: 'profile', nextStep: 'tour', title: 'Perfil concluído', description: 'Muito bom. Agora o guia continua com uma apresentação rápida das abas principais do Hub.' },
];

const css = `.onboarding-return-backdrop{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(0,0,0,.62);backdrop-filter:blur(14px);padding:20px}.onboarding-return-modal{width:min(440px,100%);border:1px solid rgba(245,199,107,.32);border-radius:28px;background:radial-gradient(circle at 90% 0,rgba(245,199,107,.18),transparent 32%),linear-gradient(135deg,#111217,#050609);box-shadow:0 34px 120px rgba(0,0,0,.55);padding:26px;color:#fff;text-align:center}.onboarding-return-badge{width:64px;height:64px;margin:0 auto 16px;border-radius:22px;display:grid;place-items:center;background:rgba(245,199,107,.14);color:#f5c76b;font-size:34px}.onboarding-return-modal h2{margin:0 0 10px;font-size:30px;letter-spacing:-.04em}.onboarding-return-modal p{margin:0 auto 20px;color:rgba(255,255,255,.72);line-height:1.45}.onboarding-return-modal a,.onboarding-return-modal button{width:100%;border:0;border-radius:18px;padding:15px 18px;font-weight:950;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px}.onboarding-return-modal a{background:linear-gradient(180deg,#ffe08a,#d59a2d);color:#130d04}.onboarding-return-modal button{margin-top:10px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12)}`;

function ensureStyles() {
  if (document.getElementById('onboarding-return-style')) return;
  const style = document.createElement('style');
  style.id = 'onboarding-return-style';
  style.textContent = css;
  document.head.appendChild(style);
}

function shouldWatch(rule: WatchRule, fromOnboarding: boolean) {
  if (fromOnboarding) return true;
  const status = window.localStorage.getItem('hub_onboarding_status_v1');
  const step = window.localStorage.getItem('hub_onboarding_step_v1');
  return status !== 'done' && (status === 'in_progress' || status === 'later') && step === rule.currentStep;
}

function showContinuation(rule: WatchRule) {
  if (document.querySelector('.onboarding-return-backdrop')) return;
  ensureStyles();
  window.localStorage.setItem('hub_onboarding_step_v1', rule.nextStep);
  window.localStorage.setItem('hub_onboarding_status_v1', 'in_progress');

  const backdrop = document.createElement('div');
  backdrop.className = 'onboarding-return-backdrop';
  backdrop.innerHTML = `<section class="onboarding-return-modal" role="dialog" aria-modal="true"><div class="onboarding-return-badge">✓</div><h2>${rule.title}</h2><p>${rule.description}</p><a href="/aluno/onboarding?step=${rule.nextStep}">Continuar Guia Inicial</a><button type="button">Fazer depois</button></section>`;
  const laterButton = backdrop.querySelector('button');
  laterButton?.addEventListener('click', () => {
    window.localStorage.setItem('hub_onboarding_status_v1', 'later');
    window.localStorage.setItem('hub_onboarding_step_v1', rule.nextStep);
    window.location.href = '/aluno';
  });
  document.body.appendChild(backdrop);
}

export function OnboardingReturnGuard() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const rule = rules.find((item) => pathname === item.path);
    if (!rule) return;
    if (!shouldWatch(rule, searchParams.get('from') === 'onboarding')) return;

    let displayed = false;
    const resume = () => {
      if (displayed) return;
      const text = document.body.textContent || '';
      if (!text.includes(rule.successText)) return;
      displayed = true;
      showContinuation(rule);
    };

    const timeout = window.setTimeout(resume, 100);
    const observer = new MutationObserver(resume);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { window.clearTimeout(timeout); observer.disconnect(); };
  }, [pathname, searchParams]);

  return null;
}
