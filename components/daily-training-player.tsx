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

type DailyStyle = CSSProperties & { '--daily-glow': string; '--daily-accent': string };
type DailyStage = 'intro' | 'tutorial' | 'setup' | 'training';

export function DailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);
  const [stage, setStage] = useState<DailyStage>('intro');
  const accent = accentMap[step.accent];
  const nextExercise = step.exerciseNumber < total ? step.exerciseNumber + 1 : null;
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

  return (
    <section className={`daily-immersive ${stage === 'training' ? 'is-training' : ''}`} style={style}>
      <style>{css}</style>
      <div className="daily-top-line">
        <Link href="/aluno/central" prefetch>←</Link>
        <span>{stage === 'training' ? 'Treino guiado' : 'Daily Workout'}</span>
        <strong>Dia {step.day}</strong>
      </div>

      {stage === 'intro' ? (
        <div className="daily-intro-panel">
          <p className="daily-kicker">Dia {step.day} • Exercício {step.exerciseNumber} de {total}</p>
          <h1>Relaxando a Voz</h1>
          <p className="daily-subtitle">Hoje vamos preparar sua voz para cantar com mais leveza e conforto.</p>
          <div className="daily-note-orbit"><span>{accent.icon}</span></div>
          <div className="daily-objective">
            <strong>O que vamos desenvolver</strong>
            <ul>
              <li>Soltar a voz sem fazer força.</li>
              <li>Preparar a musculatura antes de cantar.</li>
              <li>Perceber conforto antes de volume.</li>
            </ul>
          </div>
          <div className="daily-meta"><span>⏱ {exercise.durationLabel}</span><span>Iniciante</span></div>
          <button className="daily-start" type="button" onClick={() => setStage('tutorial')}>Começar</button>
          <Link className="daily-progress-link" href="/aluno/central/diarios/progresso" prefetch>Ver progresso do dia</Link>
          <div className="daily-bounce">⌄</div>
        </div>
      ) : null}

      {stage === 'tutorial' ? (
        <div className="daily-screen-panel">
          <p className="daily-kicker">Tutorial do exercício</p>
          <h1>Antes de praticar</h1>
          <div className="video-placeholder">
            <div className="video-icon">▶</div>
            <strong>Vídeo do professor</strong>
            <span>Pronto para receber seu tutorial em vídeo.</span>
          </div>
          <div className="instruction-grid">
            <div className="instruction-card"><h2>Como fazer</h2><p>Faça um som bem relaxado, como se sua voz estivesse acordando. Não tente cantar bonito. Apenas deixe a voz sair sem força.</p></div>
            <div className="instruction-card"><h2>Durante o exercício</h2><ul><li>Use pouco volume.</li><li>Não aperte o pescoço.</li><li>Respire normalmente.</li><li>Se a voz falhar, continue relaxado.</li></ul></div>
            <div className="instruction-card"><h2>Como saber se está certo</h2><ul><li>Sensação confortável.</li><li>Voz leve.</li><li>Nenhuma dor.</li><li>Pouco esforço.</li></ul></div>
          </div>
          <button className="daily-start" type="button" onClick={() => setStage('setup')}>Entendi, vamos praticar</button>
        </div>
      ) : null}

      {stage === 'setup' ? (
        <div className="daily-screen-panel setup-panel">
          <p className="daily-kicker">Treino personalizado</p>
          <h1>Seu treino de hoje</h1>
          <div className="paper-card">
            <span>Este exercício foi preparado para sua região vocal.</span>
            <strong>Tenor</strong>
            <p>E3 → G5</p>
            <small>Hoje vamos trabalhar em uma região confortável para começar sem tensão.</small>
          </div>
          <div className="setup-details">
            <div><strong>Som usado</strong><span>Som relaxado</span></div>
            <div><strong>Referência</strong><span>Piano + metrônomo</span></div>
            <div><strong>Meta</strong><span>Conforto antes de volume</span></div>
          </div>
          <button className="daily-start" type="button" onClick={startTraining}>Começar exercício</button>
        </div>
      ) : null}

      {stage === 'training' ? (
        <div className="daily-player-panel">
          <p className="daily-kicker">Exercício {step.exerciseNumber} de {total}</p>
          <GuidedTrainingPlayer exercise={exercise} compact />
          <div className="daily-finish-actions">
            <button className="daily-finish" type="button" onClick={finishTraining}>Concluir exercício</button>
            {nextExercise ? <Link className="daily-next" href={`/aluno/central/diarios/${nextExercise}`} prefetch>Próximo exercício</Link> : <Link className="daily-next" href="/aluno/central/diarios/progresso" prefetch>Ver progresso</Link>}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const css = `.daily-immersive{position:relative;min-height:100dvh;margin:0;padding:24px 18px 34px;color:#fff;overflow:hidden;background:radial-gradient(circle at 50% 45%,var(--daily-glow),transparent 24%),linear-gradient(180deg,#14191d,#0b0c10 58%,#050506)}.daily-immersive:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 24%,rgba(0,0,0,.72)),radial-gradient(circle at 20% 72%,rgba(255,255,255,.11),transparent 18%);pointer-events:none}.daily-immersive>*{position:relative;z-index:1}.daily-top-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 4px 22px;text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:900;color:#d6d6dc}.daily-top-line a{color:#fff;text-decoration:none;font-size:24px}.daily-top-line strong{border:1px solid var(--daily-accent);color:var(--daily-accent);border-radius:10px;padding:7px 10px}.daily-intro-panel{min-height:calc(100dvh - 120px);display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:center}.daily-kicker{color:rgba(255,255,255,.7);font-weight:900;margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em}.daily-intro-panel h1,.daily-screen-panel h1{font-size:clamp(42px,12vw,62px);letter-spacing:-.06em;line-height:.92;margin:0 0 12px}.daily-subtitle{max-width:330px;color:#d7d7de;line-height:1.45}.daily-note-orbit{width:150px;height:150px;border-radius:50%;display:grid;place-items:center;margin:26px auto;background:radial-gradient(circle,var(--daily-glow),transparent 62%);box-shadow:0 0 70px var(--daily-glow)}.daily-note-orbit span{font-size:82px;color:var(--daily-accent);filter:drop-shadow(0 0 24px var(--daily-accent))}.daily-objective,.instruction-card{align-self:stretch;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:16px;background:rgba(255,255,255,.05);backdrop-filter:blur(14px)}.daily-objective strong,.instruction-card h2{color:#fff}.daily-objective ul,.instruction-card ul{margin:10px 0 0;padding-left:18px;color:#d2d2da;line-height:1.55}.instruction-card p{color:#d2d2da;line-height:1.55;margin:8px 0 0}.daily-meta{display:flex;justify-content:center;gap:18px;margin:20px 0;color:#fff;font-weight:900}.daily-start,.daily-finish{width:min(100%,360px);border:0;border-radius:999px;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#15100a;text-decoration:none;text-transform:uppercase;font-weight:950;padding:17px 20px;text-align:center;box-shadow:0 18px 55px rgba(233,179,72,.26)}.daily-progress-link{margin-top:18px;color:#f5c76b;font-weight:900}.daily-bounce{font-size:36px;margin-top:14px;animation:dailyBounce 1.8s ease-in-out infinite;color:#fff}.daily-screen-panel{min-height:calc(100dvh - 120px);display:flex;flex-direction:column;gap:16px;align-items:center;text-align:center;justify-content:center}.video-placeholder{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:28px;min-height:210px;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));display:grid;place-items:center;padding:22px}.video-placeholder .video-icon{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#121212;font-size:34px}.video-placeholder strong{font-size:22px}.video-placeholder span{color:#cfd0d8}.instruction-grid{display:grid;gap:12px;width:100%}.paper-card{width:100%;position:relative;border-radius:8px;padding:28px 20px;background:linear-gradient(180deg,#fff,#ececec);color:#1b1b1b;box-shadow:0 22px 80px rgba(0,0,0,.3);text-align:center}.paper-card:before{content:'';position:absolute;top:-14px;left:50%;width:150px;height:28px;transform:translateX(-50%);background:rgba(224,195,133,.75)}.paper-card span,.paper-card small{display:block;color:#666}.paper-card strong{display:block;font-size:42px;margin-top:14px}.paper-card p{font-size:28px;margin:6px 0 14px;font-weight:950}.setup-details{width:100%;display:grid;gap:10px}.setup-details div{border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);padding:14px;text-align:left}.setup-details strong{display:block;color:#fff}.setup-details span{display:block;color:#cfd0d8;margin-top:4px}.daily-player-panel{display:grid;gap:16px}.daily-finish-actions{display:grid;gap:12px;justify-items:center}.daily-next{color:#f5c76b;font-weight:900;text-decoration:none}@keyframes dailyBounce{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(10px);opacity:1}}@media(min-width:760px){.daily-immersive{border-radius:34px;min-height:760px}.daily-intro-panel,.daily-screen-panel{min-height:660px}}
.daily-immersive.is-training{height:100dvh;min-height:100dvh;padding:clamp(8px,1.2dvh,14px) 10px 8px;background:linear-gradient(180deg,#20262c 0,#0b0f14 24%,#020305 100%);display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:clamp(4px,.7dvh,8px)}.is-training .daily-top-line{padding:0;display:grid;grid-template-columns:42px 1fr auto;align-items:center;min-height:clamp(42px,6dvh,58px)}.is-training .daily-top-line a{font-size:30px}.is-training .daily-top-line span{text-align:center;font-size:clamp(15px,2.1dvh,22px);letter-spacing:.14em;color:#d9d9de}.is-training .daily-top-line strong{border:1.5px solid #ffd35d;color:#ffd35d;border-radius:14px;padding:8px 13px;font-size:clamp(12px,1.7dvh,16px)}.is-training .daily-player-panel{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:clamp(4px,.7dvh,8px)}.is-training .daily-player-panel>.daily-kicker{font-size:clamp(18px,3.1dvh,31px);letter-spacing:.14em;color:#d4d4d9;margin:0;text-align:left}.is-training .daily-finish-actions{display:none}.is-training .premium-workout{height:100%!important;min-height:0!important;max-height:none!important;padding:clamp(7px,1dvh,12px)!important;background:rgba(0,0,0,.23)!important;border-radius:0!important;display:grid!important;grid-template-rows:auto auto minmax(0,1fr) auto auto auto!important;gap:clamp(4px,.7dvh,8px)!important}.is-training .premium-workout:before{opacity:.65!important}.is-training .premium-top{display:grid!important;grid-template-columns:48px 1fr 76px!important;gap:8px!important}.is-training .premium-top strong{font-size:clamp(18px,2.5dvh,28px)!important;max-width:50vw!important}.is-training .back-btn,.is-training .piano-pill{height:clamp(40px,5.3dvh,54px)!important;min-height:0!important}.is-training .time-row{margin:0!important;font-size:clamp(12px,1.7dvh,17px)!important}.is-training .workout-stage{height:auto!important;min-height:0!important;border-radius:0!important}.is-training .pitch-ruler{width:42px!important;font-size:clamp(10px,1.45dvh,15px)!important}.is-training .pitch-ruler span:after{left:26px!important;width:15px!important}.is-training .ruler-well{right:auto!important;left:46px!important;width:15px!important;top:8%!important;bottom:8%!important}.is-training .ruler-glow{right:auto!important;left:35px!important;width:32px!important;height:32px!important}.is-training .silhouette{left:clamp(70px,20vw,110px)!important;top:clamp(12px,2.5dvh,34px)!important;width:clamp(150px,31vw,230px)!important;height:clamp(230px,46dvh,390px)!important;background:url('/images/vocal-silhouette.svg') center/contain no-repeat!important;opacity:.56!important}.is-training .silhouette svg{display:none!important}.is-training .moving-field{left:clamp(84px,22vw,126px)!important;right:-45vw!important;top:clamp(28px,5dvh,55px)!important;bottom:clamp(76px,13dvh,130px)!important}.is-training .moving-canvas{transition:transform .035s linear!important}.is-training .target-path,.is-training .target-path-shadow{display:none!important}.is-training .voice-trace{stroke:#ffd44a!important;stroke-width:6!important;stroke-dasharray:620!important;stroke-dashoffset:calc(620 - (var(--progress) * 6.2))!important}.is-training .note-node{width:clamp(42px,6.4dvh,70px)!important;height:clamp(10px,1.8dvh,18px)!important;border-radius:999px!important;background:rgba(255,255,255,.72)!important;box-shadow:0 0 18px rgba(255,255,255,.25)!important}.is-training .voice-dot{left:clamp(84px,22vw,126px)!important;transition:top .025s linear!important}.is-training .feedback-card{position:absolute!important;right:clamp(4px,1.3vw,14px)!important;bottom:clamp(4px,1dvh,12px)!important;width:clamp(164px,41vw,310px)!important;margin:0!important;padding:clamp(8px,1.4dvh,14px)!important}.is-training .feedback-card b{font-size:clamp(26px,4.7dvh,50px)!important}.is-training .bottom-grid{grid-template-columns:1.1fr .82fr .82fr!important;gap:8px!important}.is-training .bottom-grid>div{padding:clamp(8px,1.25dvh,13px)!important}.is-training .keyboard{height:clamp(44px,7.2dvh,72px)!important;padding:8px 10px!important;margin:0!important}.is-training .tip{display:none!important}.is-training .controls{gap:7px!important}.is-training .controls button{padding:clamp(8px,1.4dvh,12px) 6px!important;font-size:clamp(10px,1.35dvh,13px)!important}@media(max-height:760px){.is-training .daily-top-line{min-height:42px}.is-training .daily-player-panel>.daily-kicker{font-size:18px}.is-training .premium-workout{gap:4px!important;padding:7px!important}.is-training .keyboard{height:42px!important}.is-training .bottom-grid>div{padding:7px!important}.is-training .silhouette{height:42dvh!important}.is-training .moving-field{bottom:62px!important}.is-training .feedback-card{bottom:2px!important}.is-training .premium-top{grid-template-columns:48px 1fr 76px!important}.is-training .time-row{font-size:12px!important}.is-training .controls button{padding:7px 5px!important}}@media(max-width:390px){.is-training .time-row{grid-template-columns:auto 1fr auto!important}.is-training .time-row b{display:none!important}.is-training .premium-top strong{max-width:48vw!important}.is-training .feedback-card{width:160px!important}.is-training .moving-field{left:98px!important}.is-training .voice-dot{left:98px!important}.is-training .silhouette{left:72px!important}.is-training .bottom-grid{gap:6px!important}}`;
