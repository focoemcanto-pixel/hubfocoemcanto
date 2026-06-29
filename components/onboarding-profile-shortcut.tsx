'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, Compass, RotateCcw, Sparkles } from 'lucide-react';

const STEP_LABELS: Record<string, string> = {
  welcome: 'Boas-vindas',
  vocal: 'Mapa Vocal',
  profile: 'Completar perfil',
  tour: 'Tour das abas',
  duet: 'Primeira atividade',
  record: 'Primeiro dueto',
  done: 'Concluído',
};

const STEP_ORDER = ['welcome', 'vocal', 'profile', 'tour', 'duet', 'record', 'done'];

export function OnboardingProfileShortcut() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState('welcome');
  const [status, setStatus] = useState('in_progress');

  useEffect(() => {
    const sync = () => {
      setVisible(window.location.pathname === '/aluno/perfil');
      setStep(window.localStorage.getItem('hub_onboarding_step_v1') || 'welcome');
      setStatus(window.localStorage.getItem('hub_onboarding_status_v1') || (window.localStorage.getItem('hub_onboarding_done_v1') ? 'done' : 'in_progress'));
    };
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  if (!visible) return null;
  const safeStep = STEP_ORDER.includes(step) ? step : 'welcome';
  const progress = Math.round(((STEP_ORDER.indexOf(safeStep) + 1) / STEP_ORDER.length) * 100);
  const title = status === 'done' ? 'Guia Inicial concluído' : status === 'later' ? 'Guia Inicial pausado' : 'Continue seu Guia Inicial';
  const href = status === 'done' ? '/aluno/onboarding?reset=1' : `/aluno/onboarding?step=${safeStep}`;

  return (
    <aside className="profile-onboarding-shortcut" aria-label="Guia Inicial">
      <div className="profile-onboarding-orb"><Sparkles size={18} /></div>
      <div className="profile-onboarding-copy">
        <span>{title}</span>
        <strong>{STEP_LABELS[safeStep] || 'Boas-vindas'} · {progress}%</strong>
        <i><b style={{ width: `${progress}%` }} /></i>
      </div>
      <Link href={href}>{status === 'done' ? <RotateCcw size={16} /> : <Compass size={16} />}{status === 'done' ? 'Refazer' : 'Continuar'}</Link>
      <Link className="ghost" href="/aluno/onboarding?reset=1"><CheckCircle2 size={16} /> Reiniciar</Link>
    </aside>
  );
}
