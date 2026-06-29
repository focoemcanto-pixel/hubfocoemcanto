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
const css = `.profile-onboarding-shortcut{width:min(980px,calc(100% - 28px));margin:-96px auto 118px;display:grid;grid-template-columns:auto 1fr auto auto;gap:12px;align-items:center;border:1px solid rgba(245,199,107,.28);border-radius:26px;background:linear-gradient(135deg,rgba(14,15,20,.96),rgba(5,6,10,.92));box-shadow:0 24px 90px rgba(0,0,0,.36),inset 0 1px 0 rgba(255,255,255,.08);padding:16px}.profile-onboarding-orb{width:54px;height:54px;border-radius:19px;display:grid;place-items:center;color:#f5c76b;background:rgba(245,199,107,.12);border:1px solid rgba(245,199,107,.18)}.profile-onboarding-copy{display:grid;gap:5px;min-width:0}.profile-onboarding-copy span{color:#f5c76b;font-size:12px;text-transform:uppercase;letter-spacing:.14em;font-weight:950}.profile-onboarding-copy strong{color:#fff;font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.profile-onboarding-copy i{display:block;width:100%;height:7px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.profile-onboarding-copy b{display:block;height:100%;border-radius:999px;background:#f5c76b}.profile-onboarding-shortcut a{display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:16px;text-decoration:none;font-weight:950;padding:13px 15px;color:#130d04;background:#f5c76b}.profile-onboarding-shortcut a.ghost{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#fff}@media(max-width:720px){.profile-onboarding-shortcut{grid-template-columns:auto 1fr;margin:-86px 14px 112px;border-radius:24px}.profile-onboarding-shortcut a{grid-column:1/-1}.profile-onboarding-shortcut a.ghost{display:flex}.profile-onboarding-copy span{font-size:11px}.profile-onboarding-copy strong{font-size:16px}.profile-onboarding-orb{width:46px;height:46px;border-radius:16px}}`;

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
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
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
    </>
  );
}
