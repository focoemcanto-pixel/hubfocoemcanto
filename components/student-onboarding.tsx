'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, ChevronLeft, Clock3, Compass, Home, Mic2, Music2, PlayCircle, RotateCcw, Sparkles, UserRound, Users, Volume2 } from 'lucide-react';

type StepKey = 'welcome' | 'vocal' | 'profile' | 'tour' | 'duet' | 'record' | 'done';
type GuideStatus = 'in_progress' | 'later' | 'done';

type Step = {
  key: StepKey;
  eyebrow: string;
  title: string;
  text: string;
  actionLabel: string;
};

const STORAGE_KEY = 'hub_onboarding_step_v1';
const DONE_KEY = 'hub_onboarding_done_v1';
const LATER_KEY = 'hub_onboarding_later_v1';
const STATUS_KEY = 'hub_onboarding_status_v1';

const steps: Step[] = [
  { key: 'welcome', eyebrow: 'Guia Inicial', title: 'Vamos preparar o Hub para a sua voz.', text: 'O guia é opcional e pode ser retomado depois pelo Perfil. Se continuar agora, você cria seu mapa vocal e grava sua primeira atividade.', actionLabel: 'Boas-vindas' },
  { key: 'vocal', eyebrow: 'Missão 1/5', title: 'Criar seu Mapa Vocal.', text: 'Você será levado para extensão e tessitura. Ao salvar o resultado, o guia volta automaticamente para a próxima missão.', actionLabel: 'Mapa Vocal' },
  { key: 'profile', eyebrow: 'Missão 2/5', title: 'Completar seu perfil.', text: 'Nome, foto e informações básicas ajudam a organizar suas atividades, avaliações e presença na comunidade.', actionLabel: 'Perfil' },
  { key: 'tour', eyebrow: 'Missão 3/5', title: 'Conhecer as abas principais.', text: 'Um tour rápido mostra onde ficam Feed, Biblioteca, Central, Comunidade e Perfil.', actionLabel: 'Tour das abas' },
  { key: 'duet', eyebrow: 'Missão 4/5', title: 'Encontrar a primeira atividade.', text: 'O caminho recomendado é Biblioteca → Sala de Atividades VIP → Firmando a Afinação → primeira aula → Realizar atividade.', actionLabel: 'Primeira atividade' },
  { key: 'record', eyebrow: 'Missão 5/5', title: 'Gravar seu primeiro dueto.', text: 'Você verá como ouvir a base, conferir o áudio e iniciar a gravação com contagem regressiva.', actionLabel: 'Gravação' },
  { key: 'done', eyebrow: 'Concluído', title: 'Seu Hub está pronto para treinar.', text: 'O guia fica salvo no Perfil. Você pode reiniciar quando quiser ou seguir direto para as atividades.', actionLabel: 'Concluído' },
];

const navTour = [
  { label: 'Feed', icon: Home, text: 'Acompanhe desafios, novidades e atividades recentes dos alunos.' },
  { label: 'Biblioteca', icon: BookOpen, text: 'Acesse aulas, módulos, Sala VIP e atividades práticas.' },
  { label: 'Central', icon: Compass, text: 'Monte treinos por objetivo, aquecimento, afinação, tessitura e repertório.' },
  { label: 'Comunidade', icon: Users, text: 'Publique duetos, veja práticas da turma e gere interação.' },
  { label: 'Perfil', icon: UserRound, text: 'Veja evolução, dados vocais, posts, avaliações e o botão Guia Inicial.' },
];

const duetPath = [
  { label: 'Abrir Biblioteca', href: '/aluno/biblioteca?from=onboarding&step=duet#sala-vip', detail: 'Entre na Sala de Atividades VIP.' },
  { label: 'Firmando a Afinação', href: '/aluno/biblioteca?from=onboarding&step=duet#sala-vip', detail: 'Abra o módulo liberado para começar.' },
  { label: 'Primeira aula', href: '/aluno/biblioteca?from=onboarding&step=duet#sala-vip', detail: 'Escolha a primeira aula do módulo.' },
  { label: 'Realizar atividade', href: '/aluno/biblioteca?from=onboarding&step=duet#sala-vip', detail: 'Toque no botão de atividade para gravar.' },
];

function stepIndex(key: StepKey) { return Math.max(0, steps.findIndex((item) => item.key === key)); }
function isStepKey(value: string | null): value is StepKey { return !!value && steps.some((item) => item.key === value); }
async function persistStatus(status: GuideStatus, step: StepKey) {
  try { await fetch('/api/onboarding/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, step }) }); } catch {}
}
async function markOnboardingDone() {
  try { await fetch('/api/onboarding/done', { method: 'POST' }); } catch {}
}

export function StudentOnboarding() {
  const [current, setCurrent] = useState<StepKey>('welcome');
  const [tourIndex, setTourIndex] = useState(0);
  const index = stepIndex(current);
  const progress = Math.round(((index + 1) / steps.length) * 100);
  const step = steps[index];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      window.localStorage.removeItem(DONE_KEY);
      window.localStorage.removeItem(LATER_KEY);
      window.localStorage.setItem(STATUS_KEY, 'in_progress');
      window.localStorage.setItem(STORAGE_KEY, 'welcome');
      setCurrent('welcome');
      void persistStatus('in_progress', 'welcome');
      return;
    }
    const requestedStep = params.get('step');
    if (isStepKey(requestedStep)) {
      setCurrent(requestedStep);
      window.localStorage.setItem(STORAGE_KEY, requestedStep);
      window.localStorage.setItem(STATUS_KEY, requestedStep === 'done' ? 'done' : 'in_progress');
      return;
    }
    const saved = window.localStorage.getItem(STORAGE_KEY) as StepKey | null;
    if (saved && steps.some((item) => item.key === saved)) setCurrent(saved);
  }, []);

  function setGuideStep(nextStep: StepKey) {
    setCurrent(nextStep);
    const status: GuideStatus = nextStep === 'done' ? 'done' : 'in_progress';
    window.localStorage.setItem(STORAGE_KEY, nextStep);
    window.localStorage.setItem(STATUS_KEY, status);
    window.localStorage.removeItem(LATER_KEY);
    void persistStatus(status, nextStep);
  }

  const next = () => setGuideStep(steps[Math.min(steps.length - 1, index + 1)].key);
  const prev = () => setGuideStep(steps[Math.max(0, index - 1)].key);
  const restart = () => setGuideStep('welcome');
  const finish = async () => {
    window.localStorage.setItem(DONE_KEY, '1');
    window.localStorage.setItem(STORAGE_KEY, 'done');
    window.localStorage.setItem(STATUS_KEY, 'done');
    window.localStorage.removeItem(LATER_KEY);
    await markOnboardingDone();
    window.location.href = '/aluno';
  };
  const doLater = async () => {
    window.localStorage.setItem(LATER_KEY, '1');
    window.localStorage.setItem(STORAGE_KEY, current);
    window.localStorage.setItem(STATUS_KEY, 'later');
    await persistStatus('later', current);
    window.location.href = '/aluno';
  };

  const statusItems = useMemo(() => steps.slice(1, -1).map((item) => ({ label: item.actionLabel, done: stepIndex(current) > stepIndex(item.key) })), [current]);

  return (
    <main className="student-onboarding-page">
      <section className="onboarding-shell">
        <header className="onboarding-topbar">
          <button type="button" onClick={prev} disabled={index === 0}><ChevronLeft size={18} /> Voltar</button>
          <div className="onboarding-progress" aria-label={`Progresso ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
          <button type="button" onClick={doLater}><Clock3 size={17} /> Fazer depois</button>
        </header>

        <section className="onboarding-hero-card">
          <div className="onboarding-copy">
            <p className="eyebrow"><Sparkles size={14} /> {step.eyebrow}</p>
            <h1>{step.title}</h1>
            <p>{step.text}</p>
          </div>
          <div className="onboarding-status-card">
            <span>Guia Inicial</span>
            <strong>{progress}%</strong>
            <div>{statusItems.map((item) => <small className={item.done ? 'done' : ''} key={item.label}><CheckCircle2 size={14} /> {item.label}</small>)}</div>
            <button className="secondary-onboarding-action mini" type="button" onClick={restart}><RotateCcw size={16} /> Reiniciar</button>
          </div>
        </section>

        {current === 'welcome' ? <WelcomePanel onNext={next} onLater={doLater} /> : null}
        {current === 'vocal' ? <VocalPanel onNext={next} /> : null}
        {current === 'profile' ? <ProfilePanel onNext={next} /> : null}
        {current === 'tour' ? <TourPanel tourIndex={tourIndex} setTourIndex={setTourIndex} onNext={next} /> : null}
        {current === 'duet' ? <DuetMissionPanel onNext={next} /> : null}
        {current === 'record' ? <RecordGuidePanel onNext={next} /> : null}
        {current === 'done' ? <DonePanel onFinish={finish} /> : null}
      </section>
    </main>
  );
}

function WelcomePanel({ onNext, onLater }: { onNext: () => void; onLater: () => void }) {
  return <section className="onboarding-panel two-cols"><div className="mission-card featured"><Mic2 size={34} /><h2>Primeira vitória: sua voz configurada.</h2><p>O objetivo não é só explicar o app. É fazer o aluno sair com Mapa Vocal, perfil pronto e primeira atividade orientada.</p></div><div className="mission-list"><p><CheckCircle2 /> Pode ser feito agora ou depois</p><p><CheckCircle2 /> Fica disponível em Perfil → Guia Inicial</p><p><CheckCircle2 /> Volta automaticamente após cada ação</p><p><CheckCircle2 /> Funciona melhor no mobile</p><button onClick={onNext}>Começar guia <ArrowRight size={18} /></button><button className="secondary-onboarding-action" onClick={onLater}><Clock3 size={18} /> Fazer isso depois</button></div></section>;
}

function VocalPanel({ onNext }: { onNext: () => void }) {
  return <section className="onboarding-panel two-cols"><div className="mission-card"><Volume2 size={34} /><h2>Missão: criar Mapa Vocal.</h2><p>Ao tocar no botão, você vai para extensão e tessitura. Depois de salvar, volta sozinho para a próxima etapa.</p><Link className="premium-link" href="/aluno/perfil-vocal?from=onboarding&next=profile">Iniciar Mapa Vocal</Link></div><div className="mission-card dark"><h3>Já fez essa parte?</h3><p>Use continuar apenas se você já concluiu o mapa ou deseja avançar manualmente.</p><button onClick={onNext}>Continuar para perfil <ArrowRight size={18} /></button></div></section>;
}

function ProfilePanel({ onNext }: { onNext: () => void }) {
  return <section className="onboarding-panel two-cols"><div className="mission-card"><UserRound size={34} /><h2>Missão: completar perfil.</h2><p>Salve seu nome, foto e informações básicas. Depois de salvar, o guia volta para o tour automaticamente.</p><Link className="premium-link" href="/aluno/perfil/editar?from=onboarding&next=tour">Editar e salvar perfil</Link></div><div className="mission-card dark"><h3>Perfil já está pronto?</h3><p>Avance para conhecer as abas sem sair do guia.</p><button onClick={onNext}>Continuar para tour <ArrowRight size={18} /></button></div></section>;
}

function TourPanel({ tourIndex, setTourIndex, onNext }: { tourIndex: number; setTourIndex: (value: number) => void; onNext: () => void }) {
  const item = navTour[tourIndex];
  const Icon = item.icon;
  const last = tourIndex >= navTour.length - 1;
  return <section className="onboarding-panel"><div className="tour-phone"><div className="tour-spotlight"><Icon size={34} /><strong>{item.label}</strong><p>{item.text}</p></div><nav>{navTour.map((tab, i) => <button className={i === tourIndex ? 'active' : ''} key={tab.label} onClick={() => setTourIndex(i)}>{tab.label}</button>)}</nav></div><div className="tour-actions"><button onClick={() => last ? onNext() : setTourIndex(tourIndex + 1)}>{last ? 'Encontrar primeira atividade' : 'Próxima aba'} <ArrowRight size={18} /></button></div></section>;
}

function DuetMissionPanel({ onNext }: { onNext: () => void }) {
  return <section className="onboarding-panel"><div className="duet-path">{duetPath.map((item, index) => <Link href={item.href} className="path-step" key={item.label} onClick={() => window.localStorage.setItem(STORAGE_KEY, 'duet')}><span>{index + 1}</span><strong>{item.label}</strong><small>{item.detail}</small></Link>)}</div><div className="tour-actions"><p>Depois de abrir a atividade e entender o caminho, volte ao guia pelo Perfil ou por esta tela para concluir.</p><button onClick={onNext}>Já encontrei a atividade <ArrowRight size={18} /></button></div></section>;
}

function RecordGuidePanel({ onNext }: { onNext: () => void }) {
  return <section className="onboarding-panel"><div className="record-guide-grid"><div><PlayCircle size={28} /><strong>Ouvir base</strong><p>Escute a referência antes de gravar para entrar no tempo certo.</p></div><div><Mic2 size={28} /><strong>Áudio</strong><p>Use fone e confira o microfone antes de começar.</p></div><div><Music2 size={28} /><strong>Gravar</strong><p>Toque em iniciar. A contagem 3, 2, 1 prepara sua entrada.</p></div></div><div className="tour-actions"><Link className="premium-link" href="/aluno/biblioteca?from=onboarding&step=record#sala-vip">Abrir atividade na Biblioteca</Link><button onClick={onNext}>Concluir guia <ArrowRight size={18} /></button></div></section>;
}

function DonePanel({ onFinish }: { onFinish: () => void }) {
  return <section className="onboarding-panel done-panel"><CheckCircle2 size={54} /><h2>Pronto. O Guia Inicial fica salvo no Perfil.</h2><p>Você pode treinar normalmente agora. Sempre que quiser repetir o guia, vá em Perfil → Guia Inicial.</p><button onClick={onFinish}>Entrar no Hub <ArrowRight size={18} /></button><Link className="premium-link secondary-onboarding-action" href="/aluno/onboarding?reset=1">Reiniciar guia</Link></section>;
}
