'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { DailyTrainingStep } from '@/lib/training-center';

type Stage = 'intro' | 'calibrate' | 'ready' | 'run';
const TOTAL_SECONDS = 30;

function BreathBars({ level = 0.5 }: { level?: number }) {
  const bars = Array.from({ length: 8 }, (_, index) => index);
  return <div className="bars">{bars.map((bar) => <i key={bar} className={level * 8 > bar ? 'on' : ''} />)}<b /></div>;
}

export function BreathExperience({ step }: { step: DailyTrainingStep }) {
  const [stage, setStage] = useState<Stage>('intro');
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [progress, setProgress] = useState(0);
  const [level, setLevel] = useState(0.35);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  function startRun() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setStage('run');
    setSecondsLeft(TOTAL_SECONDS);
    setProgress(0);
    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const nextProgress = Math.min(1, elapsed / TOTAL_SECONDS);
      setProgress(nextProgress);
      setLevel(0.45 + Math.sin(elapsed * 4) * 0.18);
      setSecondsLeft(Math.max(0, Math.ceil(TOTAL_SECONDS - elapsed)));
      if (nextProgress >= 1 && timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 80);
  }

  return (
    <section className="breath-exp">
      <style>{css}</style>
      <div className="breath-top"><Link href="/aluno/central/diarios">Sair</Link><b>Exercício de Respiração</b><span>ⓘ</span></div>
      {stage === 'intro' ? <div className="breath-card"><div className="video-box">▶</div><h1>Exercício de Apoio da Respiração</h1><p>Expire com “SSS...” e sustente o fluxo por 30 segundos. O objetivo é manter o ar constante, sem força e sem tensão.</p><button onClick={() => setStage('calibrate')}>Continuar</button></div> : null}
      {stage === 'calibrate' ? <div className="breath-center"><h2>Detectando nível de ruído de fundo</h2><p>Por favor, mantenha-se em silêncio...</p><div className="big-ring"><span>Nível de Respiração</span></div><button onClick={() => setStage('ready')}>Continuar mesmo assim</button></div> : null}
      {stage === 'ready' ? <div className="breath-center"><h2>Expire com “SSS...”<br />e segure por 30s</h2><p>Pressione “Começar” quando estiver pronto</p><div className="big-ring"><BreathBars level={0.45} /><span>Nível de Respiração</span></div><button className="start-big" onClick={startRun}>Começar</button></div> : null}
      {stage === 'run' ? <div className="breath-center"><h2>{secondsLeft} seg</h2><div className="big-ring active" style={{ '--progress': `${progress * 360}deg` } as CSSProperties}><BreathBars level={level} /><span>Nível de Respiração</span></div></div> : null}
    </section>
  );
}

const css = `.breath-exp{min-height:100dvh;background:radial-gradient(circle at 50% 20%,rgba(255,255,255,.06),transparent 28%),linear-gradient(180deg,#1a1a1a,#050505);color:#fff;padding:calc(env(safe-area-inset-top) + 28px) 18px 34px;overflow:hidden}.breath-exp:before{content:'';position:absolute;inset:0;background:rgba(255,255,255,.02);pointer-events:none}.breath-top{display:flex;align-items:center;justify-content:space-between;font-family:Georgia,serif;color:rgba(255,255,255,.86);margin-bottom:34px}.breath-top a{border:1px solid rgba(255,255,255,.55);border-radius:999px;padding:8px 18px;color:#fff;text-decoration:none}.breath-top b{font-size:18px}.breath-top span{font-size:30px}.breath-card{border:1px solid rgba(255,255,255,.2);border-radius:34px;background:rgba(0,0,0,.36);padding:24px;min-height:70dvh;display:flex;flex-direction:column;gap:22px}.video-box{height:210px;border-radius:22px;background:#000;display:grid;place-items:center;font-size:62px;color:red}.breath-card h1{font-size:28px;margin:0}.breath-card p{font-family:Georgia,serif;font-size:22px;line-height:1.35;color:rgba(255,255,255,.82)}.breath-card button,.breath-center button{border:0;border-radius:999px;background:#fff;color:#111;padding:16px 24px;font-size:18px;font-weight:900}.breath-center{text-align:center;display:flex;min-height:78dvh;flex-direction:column;align-items:center;justify-content:center;font-family:Georgia,serif}.breath-center h2{font-size:34px;line-height:1.18;margin:0 0 22px}.breath-center p{font-size:25px;line-height:1.22;margin:0 0 42px}.big-ring{width:min(82vw,360px);aspect-ratio:1;border-radius:50%;border:10px solid rgba(255,255,255,.25);box-shadow:0 0 30px rgba(255,255,255,.18);display:grid;place-items:center;position:relative;margin-bottom:42px}.big-ring.active{border-color:rgba(255,255,255,.22);background:conic-gradient(#fff var(--progress),rgba(255,255,255,.16) 0)}.big-ring span{position:absolute;bottom:26%;font-size:26px}.bars{display:flex;flex-direction:column-reverse;gap:7px}.bars i{display:block;width:58px;height:18px;background:rgba(255,255,255,.12)}.bars i.on{background:rgba(255,255,255,.74)}.bars:after{content:'';display:block;height:2px;background:#d91818}.start-big{font-size:58px!important;background:transparent!important;color:#fff!important;font-family:Georgia,serif}`;
