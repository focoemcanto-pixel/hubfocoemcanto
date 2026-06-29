'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, ChevronLeft, Compass, Home, Mic2, Music2, PlayCircle, Sparkles, UserRound, Users, Volume2, X } from 'lucide-react';

type StepKey = 'welcome' | 'vocal' | 'profile' | 'tour' | 'duet' | 'record' | 'done';

type Step = {
  key: StepKey;
  eyebrow: string;
  title: string;
  text: string;
};

const STORAGE_KEY = 'hub_onboarding_step_v1';
const DONE_KEY = 'hub_onboarding_done_v1';

const steps: Step[] = [
  { key: 'welcome', eyebrow: 'Primeira configuração', title: 'Vamos preparar o Hub para a sua voz.', text: 'Em poucos passos você descobre sua extensão, configura seu perfil e grava sua primeira atividade guiada.' },
  { key: 'vocal', eyebrow: 'Mapa Vocal', title: 'Descubra extensão e tessitura.', text: 'A avaliação cria uma base para personalizar aquecimentos, vocalizes e atividades de dueto conforme sua voz real.' },
  { key: 'profile', eyebrow: 'Perfil do aluno', title: 'Complete sua identidade no Hub.', text: 'Seu perfil organiza seus resultados, atividades, histórico e presença na comunidade.' },
  { key: 'tour', eyebrow: 'Conheça as abas', title: 'Entenda onde tudo acontece.', text: 'Feed, Biblioteca, Central, Comunidade e Perfil: cada aba tem uma missão dentro da sua evolução.' },
  { key: 'duet', eyebrow: 'Primeira missão prática', title: 'Vamos gravar seu primeiro dueto.', text: 'Você será guiado até Biblioteca → Sala de Atividades VIP → Firmando a Afinação → primeira aula → Realizar atividade.' },
  { key: 'record', eyebrow: 'Tela de gravação', title: 'Aprenda a gravar com segurança.', text: 'Ouça a base, confira câmera e áudio, toque em gravar e entre após a contagem regressiva.' },
  { key: 'done', eyebrow: 'Tudo pronto', title: 'Seu Hub está configurado.', text: 'Agora você já sabe onde treinar, como encontrar atividades e como enviar seu primeiro dueto.' },
];

const navTour = [
  { label: 'Feed', icon: Home, text: 'Acompanhe desafios, novidades e atividades recentes dos alunos.' },
  { label: 'Biblioteca', icon: BookOpen, text: 'Acesse aulas, módulos, Sala VIP e atividades práticas.' },
  { label: 'Central', icon: Compass, text: 'Monte treinos por objetivo, aquecimento, afinação, tessitura e repertório.' },
  { label: 'Comunidade', icon: Users, text: 'Publique duetos, veja práticas da turma e gere interação.' },
  { label: 'Perfil', icon: UserRound, text: 'Veja evolução, dados vocais, posts, avaliações e ajustes.' },
];

const duetPath = [
  { label: 'Abrir Biblioteca', href: '/aluno/biblioteca#sala-vip', detail: 'Entre na Sala de Atividades VIP.' },
  { label: 'Escolher Firmando a Afinação', href: '/aluno/biblioteca#sala-vip', detail: 'Abra o módulo gratuito/liberado.' },
  { label: 'Entrar na primeira aula', href: '/aluno/biblioteca#sala-vip', detail: 'Toque na primeira aula do módulo.' },
  { label: 'Clicar em Realizar atividade', href: '/aluno/biblioteca#sala-vip', detail: 'A tela de gravação do dueto será aberta.' },
];

function stepIndex(key: StepKey) { return Math.max(0, steps.findIndex((item) => item.key === key)); }

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
    const saved = window.localStorage.getItem(STORAGE_KEY) as StepKey | null;
    if (saved && steps.some((item) => item.key === saved)) setCurrent(saved);
  }, []);

  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, current); }, [current]);

  const next = () => setCurrent(steps[Math.min(steps.length - 1, index + 1)].key);
  const prev = () => setCurrent(steps[Math.max(0, index - 1)].key);
  const finish = async () => {
    window.localStorage.setItem(DONE_KEY, '1');
    window.localStorage.setItem(STORAGE_KEY, 'done');
    await markOnboardingDone();
    window.location.href = '/aluno';
  };
  const skip = async () => {
    window.localStorage.setItem(DONE_KEY, '1');
    await markOnboardingDone();
    window.location.href = '/aluno';
  };

  const statusItems = useMemo(() => [
    { label: 'Perfil vocal', done: index >= 1 },
    { label: 'Perfil completo', done: index >= 2 },
    { label: 'Tour da plataforma', done: index >= 3 },
    { label: 'Primeiro dueto', done: index >= 4 },
  ], [index]);

  return (
    <main className="student-onboarding-page">
      <section className="onboarding-shell">
        <header className="onboarding-topbar">
          <button type="button" onClick={prev} disabled={index === 0}><ChevronLeft size={18} /> Voltar</button>
          <div className="onboarding-progress" aria-label={`Progresso ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
          <button type="button" onClick={skip}><X size={17} /> Pular</button>
        </header>

        <section className="onboarding-hero-card">
          <div className="onboarding-hero-glow" />
          <div className="onboarding-copy">
            <p className="eyebrow"><Sparkles size={14} /> {step.eyebrow}</p>
            <h1>{step.title}</h1>
            <p>{step.text}</p>
          </div>
          <div className="onboarding-status-card">
            <span>Configuração da voz</span>
            <strong>{progress}%</strong>
            <div>{statusItems.map((item) => <small className={item.done ? 'done' : ''} key={item.label}><CheckCircle2 size={14} /> {item.label}</small>)}</div>
          </div>
        </section>

        {current === 'welcome' ? <WelcomePanel onNext={next} /> : null}
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

function WelcomePanel({ onNext }: { onNext: () => void }) {
  return <section className="onboarding-panel two-cols"><div className="mission-card featured"><Mic2 size={34} /><h2>O Hub vai conhecer sua voz.</h2><p>Primeiro configuramos extensão e tessitura. Depois mostramos o caminho para sua primeira prática real.</p></div><div className="mission-list"><p><CheckCircle2 /> Avaliação vocal guiada</p><p><CheckCircle2 /> Perfil completo</p><p><CheckCircle2 /> Tour pelas abas</p><p><CheckCircle2 /> Primeiro dueto orientado</p><button onClick={onNext}>Começar configuração <ArrowRight size={18} /></button></div></section>;
}

function VocalPanel({ onNext }: { onNext: () => void }) {
  return <section className="onboarding-panel two-cols"><div className="mission-card"><Volume2 size={34} /><h2>Faça sua avaliação vocal.</h2><p>Você será levado para o teste de extensão e tessitura. Ao terminar, volte para continuar o onboarding.</p><Link className="premium-link" href="/aluno/perfil-vocal?from=onboarding">Iniciar avaliação vocal</Link></div><div className="mission-card dark"><h3>O que será usado no app?</h3><p>Faixa confortável, extremos da extensão, tessitura prática e recomendações para exercícios personalizados.</p><button onClick={onNext}>Já fiz / continuar <ArrowRight size={18} /></button></div></section>;
}

function ProfilePanel({ onNext }: { onNext: () => void }) {
  return <section className="onboarding-panel two-cols"><div className="mission-card"><UserRound size={34} /><h2>Complete seu perfil.</h2><p>Nome, foto e dados básicos deixam sua presença pronta para atividades, publicações e avaliações.</p><Link className="premium-link" href="/aluno/perfil/editar?from=onboarding">Concluir perfil</Link></div><div className="mission-card dark"><h3>Depois disso...</h3><p>Você será apresentado às abas principais para não se perder no Hub.</p><button onClick={onNext}>Continuar tour <ArrowRight size={18} /></button></div></section>;
}

function TourPanel({ tourIndex, setTourIndex, onNext }: { tourIndex: number; setTourIndex: (value: number) => void; onNext: () => void }) {
  const item = navTour[tourIndex];
  const Icon = item.icon;
  const last = tourIndex >= navTour.length - 1;
  return <section className="onboarding-panel"><div className="tour-phone"><div className="tour-spotlight"><Icon size={34} /><strong>{item.label}</strong><p>{item.text}</p></div><nav>{navTour.map((tab, i) => <button className={i === tourIndex ? 'active' : ''} key={tab.label} onClick={() => setTourIndex(i)}>{tab.label}</button>)}</nav></div><div className="tour-actions"><button onClick={() => last ? onNext() : setTourIndex(tourIndex + 1)}>{last ? 'Ir para primeira missão' : 'Próxima aba'} <ArrowRight size={18} /></button></div></section>;
}

function DuetMissionPanel({ onNext }: { onNext: () => void }) {
  return <section className="onboarding-panel"><div className="duet-path">{duetPath.map((item, index) => <Link href={item.href} className="path-step" key={item.label}><span>{index + 1}</span><strong>{item.label}</strong><small>{item.detail}</small></Link>)}</div><div className="tour-actions"><p>Quando chegar na aula, toque em <strong>Realizar atividade</strong>. Depois volte aqui para fechar o guia.</p><button onClick={onNext}>Ver como gravar <ArrowRight size={18} /></button></div></section>;
}

function RecordGuidePanel({ onNext }: { onNext: () => void }) {
  return <section className="onboarding-panel"><div className="record-guide-grid"><div><PlayCircle size={28} /><strong>Ouvir base</strong><p>Escute a referência antes de gravar.</p></div><div><Mic2 size={28} /><strong>Áudio</strong><p>Use fone e confira o microfone.</p></div><div><Music2 size={28} /><strong>Gravar</strong><p>Toque em iniciar. A contagem 3, 2, 1 prepara sua entrada.</p></div></div><div className="tour-actions"><Link className="premium-link" href="/aluno/biblioteca#sala-vip">Abrir missão na Biblioteca</Link><button onClick={onNext}>Concluir onboarding <ArrowRight size={18} /></button></div></section>;
}

function DonePanel({ onFinish }: { onFinish: () => void }) {
  return <section className="onboarding-panel done-panel"><CheckCircle2 size={54} /><h2>Pronto. Seu Hub já tem direção.</h2><p>Agora você pode treinar por objetivo, gravar duetos e acompanhar sua evolução vocal.</p><button onClick={onFinish}>Entrar no Hub <ArrowRight size={18} /></button></section>;
}
