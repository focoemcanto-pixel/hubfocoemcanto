'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { GuidedTrainingPlayer } from '@/components/guided-training-player';
import { completeDailyStep } from '@/lib/daily-training-progress';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

const accentMap = {
  gold: { icon: '♪', glow: 'rgba(245,199,107,.34)', color: '#f5c76b' },
  teal: { icon: '☁', glow: 'rgba(38,224,196,.32)', color: '#26e0c4' },
  purple: { icon: '♫', glow: 'rgba(155,76,255,.32)', color: '#a855f7' },
};

const activityNames = ['Aquecimento', 'Respiração', 'Afinação', 'Percepção'];
const activityIntros = [
  'Prepare a voz percorrendo sua tessitura confortável, com leveza e sem tensão.',
  'Organize o fluxo de ar antes de cantar e mantenha controle durante toda a emissão.',
  'Treine o centro da nota com referência visual, piano e resposta do afinador.',
  'Desenvolva percepção para reconhecer caminhos melódicos e divisões com segurança.',
];

type DailyStyle = CSSProperties & { '--daily-glow': string; '--daily-accent': string };
type DailyStage = 'intro' | 'tutorial' | 'setup' | 'training';

export function DailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);
  const [stage, setStage] = useState<DailyStage>('intro');
  const accent = accentMap[step.accent];
  const nextExercise = step.exerciseNumber < total ? step.exerciseNumber + 1 : null;
  const activityName = activityNames[step.exerciseNumber - 1] || 'Treino';
  const intro = activityIntros[step.exerciseNumber - 1] || exercise.objective;
  const style = { '--daily-glow': accent.glow, '--daily-accent': accent.color } as DailyStyle;

  function startTraining() {
    startedAtRef.current = Date.now();
    setStage('training');
  }

  function finishTraining() {
    const durationSeconds = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 1;
    completeDailyStep(step, durationSeconds);
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  if (stage === 'training') {
    return (
      <section className="daily-training-screen">
        <style>{css}</style>
        <GuidedTrainingPlayer exercise={exercise} compact />
        <button className="finish-hidden" type="button" onClick={finishTraining}>Concluir exercício</button>
        {nextExercise ? <Link className="finish-hidden-link" href={`/aluno/central/diarios/${nextExercise}`} prefetch>Próximo</Link> : null}
      </section>
    );
  }

  return (
    <section className="daily-immersive" style={style}>
      <style>{css}</style>
      <div className="daily-top-line"><Link href="/aluno/central/diarios" prefetch>←</Link><span>Treino Diário</span><strong>Dia {step.day}</strong></div>
      {stage === 'intro' ? <div className="daily-intro-panel"><p className="daily-kicker">Atividade {step.exerciseNumber} de {total}</p><h1>Atividade {step.exerciseNumber}</h1><p className="daily-activity-name">({activityName})</p><p className="daily-subtitle">{intro}</p><div className="daily-note-orbit"><span>{accent.icon}</span></div><div className="daily-objective"><strong>Objetivo desta atividade</strong><ul><li>Aquecer sem forçar a garganta.</li><li>Sentir vibração leve com boca fechada.</li><li>Percorrer sua região confortável com precisão.</li></ul></div><div className="daily-meta"><span>⏱ {exercise.durationLabel}</span><span>{exercise.bpm} BPM</span></div><button className="daily-start" type="button" onClick={() => setStage('tutorial')}>Começar</button><Link className="daily-progress-link" href="/aluno/central/diarios/progresso" prefetch>Ver progresso do dia</Link></div> : null}
      {stage === 'tutorial' ? <div className="daily-screen-panel"><p className="daily-kicker">Tutorial da atividade</p><h1>Antes de praticar</h1><div className="video-placeholder"><div className="video-icon">▶</div><strong>Vídeo do professor</strong><span>Espaço reservado para a explicação em vídeo.</span></div><div className="instruction-grid"><div className="instruction-card"><h2>Como fazer</h2><p>Faça boca chiusa: som de “Mmm” com os lábios fechados, sentindo vibração leve no rosto e sem buscar volume.</p></div><div className="instruction-card"><h2>Durante o exercício</h2><ul><li>Cante com pouco volume.</li><li>Não aperte o pescoço.</li><li>Siga as faixas da timeline.</li><li>Deixe o piano preparar cada novo tom.</li></ul></div><div className="instruction-card"><h2>Como saber se está certo</h2><ul><li>Sensação confortável.</li><li>Som leve e estável.</li><li>Bolinha passando próxima da faixa.</li><li>Nenhuma dor ou aperto.</li></ul></div></div><button className="daily-start" type="button" onClick={() => setStage('setup')}>Entendi, vamos praticar</button></div> : null}
      {stage === 'setup' ? <div className="daily-screen-panel setup-panel"><p className="daily-kicker">Treino personalizado</p><h1>Atividade {step.exerciseNumber}</h1><p className="daily-activity-name">({activityName})</p><div className="paper-card"><span>Este exercício será ajustado para sua região vocal.</span><strong>Boca Chiusa</strong><p>5 graus</p><small>O vocalize sobe e desce por graus conjuntos, com acordes de preparação entre os tons.</small></div><div className="setup-details"><div><strong>Som usado</strong><span>Mmm com boca fechada</span></div><div><strong>Referência</strong><span>Piano real + metrônomo</span></div><div><strong>Meta</strong><span>Leveza, aquecimento e centro da nota</span></div></div><button className="daily-start" type="button" onClick={startTraining}>Começar exercício</button></div> : null}
    </section>
  );
}

const css = `.daily-immersive{position:relative;min-height:100dvh;margin:0;padding:24px 18px 34px;color:#fff;overflow:hidden;background:radial-gradient(circle at 50% 45%,var(--daily-glow),transparent 24%),linear-gradient(180deg,#14191d,#0b0c10 58%,#050506)}.daily-immersive:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 24%,rgba(0,0,0,.72)),radial-gradient(circle at 20% 72%,rgba(255,255,255,.11),transparent 18%);pointer-events:none}.daily-immersive>*{position:relative;z-index:1}.daily-top-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 4px 22px;text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:900;color:#d6d6dc}.daily-top-line a{color:#fff;text-decoration:none;font-size:24px}.daily-top-line strong{border:1px solid var(--daily-accent);color:var(--daily-accent);border-radius:10px;padding:7px 10px}.daily-intro-panel{min-height:calc(100dvh - 120px);display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:center}.daily-kicker{color:rgba(255,255,255,.7);font-weight:900;margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em}.daily-intro-panel h1,.daily-screen-panel h1{font-size:clamp(42px,12vw,62px);letter-spacing:-.06em;line-height:.92;margin:0 0 8px}.daily-activity-name{font-size:24px;margin:0 0 12px;color:rgba(255,255,255,.82);font-weight:500}.daily-subtitle{max-width:330px;color:#d7d7de;line-height:1.45;margin:0}.daily-note-orbit{width:132px;height:132px;border-radius:50%;display:grid;place-items:center;margin:22px auto;background:radial-gradient(circle,var(--daily-glow),transparent 62%);box-shadow:0 0 70px var(--daily-glow)}.daily-note-orbit span{font-size:72px;color:var(--daily-accent);filter:drop-shadow(0 0 24px var(--daily-accent))}.daily-objective,.instruction-card{align-self:stretch;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:16px;background:rgba(255,255,255,.05);backdrop-filter:blur(14px)}.daily-objective ul,.instruction-card ul{margin:10px 0 0;padding-left:18px;color:#d2d2da;line-height:1.55}.instruction-card p{color:#d2d2da;line-height:1.55;margin:8px 0 0}.daily-meta{display:flex;justify-content:center;gap:18px;margin:18px 0;color:#fff;font-weight:900}.daily-start{width:min(100%,360px);border:0;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#15100a;text-transform:uppercase;font-weight:950;padding:17px 20px;text-align:center}.daily-progress-link{margin-top:18px;color:#f5c76b;font-weight:900}.daily-screen-panel{min-height:calc(100dvh - 120px);display:flex;flex-direction:column;gap:16px;align-items:center;text-align:center;justify-content:center}.video-placeholder{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:28px;min-height:190px;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));display:grid;place-items:center;padding:22px}.video-placeholder .video-icon{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#121212;font-size:34px}.video-placeholder strong{font-size:22px}.video-placeholder span{color:#cfd0d8}.instruction-grid{display:grid;gap:12px;width:100%}.paper-card{width:100%;position:relative;border-radius:8px;padding:28px 20px;background:linear-gradient(180deg,#fff,#ececec);color:#1b1b1b;text-align:center}.paper-card:before{content:'';position:absolute;top:-14px;left:50%;width:150px;height:28px;transform:translateX(-50%);background:rgba(224,195,133,.75)}.paper-card span,.paper-card small{display:block;color:#666}.paper-card strong{display:block;font-size:38px;margin-top:14px}.paper-card p{font-size:28px;margin:6px 0 14px;font-weight:950}.setup-details{width:100%;display:grid;gap:10px}.setup-details div{border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);padding:14px;text-align:left}.setup-details strong{display:block;color:#fff}.setup-details span{display:block;color:#cfd0d8;margin-top:4px}.daily-training-screen{height:100dvh;max-height:100dvh;overflow:hidden;background:#050607;color:#fff;padding:0;margin:0}.finish-hidden,.finish-hidden-link{display:none}@media(max-height:740px){.daily-intro-panel,.daily-screen-panel{min-height:calc(100dvh - 94px)}.daily-note-orbit{width:104px;height:104px;margin:14px auto}.daily-note-orbit span{font-size:58px}.daily-objective{display:none}.video-placeholder{min-height:150px}.instruction-grid{max-height:330px;overflow:auto}.paper-card{padding:22px 16px}.setup-details{gap:8px}.setup-details div{padding:11px 13px}}`;
