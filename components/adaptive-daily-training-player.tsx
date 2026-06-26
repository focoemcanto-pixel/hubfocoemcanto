'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { DailyTrainingPlayer } from '@/components/daily-training-player';
import { personalizeDailyWarmup } from '@/lib/adaptive-training';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

function BreathVisualExperience({ step }: { step: DailyTrainingStep }) {
  const [started, setStarted] = useState(false);
  return (
    <section className="breath-exp">
      <style>{`.breath-exp{min-height:100dvh;background:linear-gradient(180deg,#171717,#050506);color:#fff;padding:28px 22px;display:flex;flex-direction:column;align-items:center;text-align:center}.breath-exp a{align-self:flex-start;color:#fff;text-decoration:none;font-size:28px}.breath-exp h1{font-family:Georgia,serif;font-size:22px;margin:36px 0 70px;color:rgba(255,255,255,.75)}.breath-time{font-family:Georgia,serif;font-size:34px;font-weight:900;margin-bottom:24px}.breath-circle{width:min(82vw,360px);aspect-ratio:1;border-radius:50%;border:10px solid rgba(255,255,255,.28);display:grid;place-items:center;position:relative;box-shadow:0 0 30px rgba(255,255,255,.08)}.breath-meter{display:flex;flex-direction:column-reverse;gap:6px}.breath-meter i{width:54px;height:16px;background:rgba(255,255,255,.12);display:block}.breath-meter i:nth-child(-n+4){background:rgba(255,255,255,.74)}.breath-meter b{height:2px;background:#d91818}.breath-circle span{position:absolute;bottom:22%;font-family:Georgia,serif;font-size:23px}.breath-exp p{font-family:Georgia,serif;font-size:20px;line-height:1.35;margin:34px 0 22px;color:rgba(255,255,255,.84)}.breath-exp button{width:min(360px,88vw);border:0;border-radius:999px;background:#fff;color:#111;padding:17px 20px;font-weight:950;text-transform:uppercase;font-size:18px}`}</style>
      <Link href="/aluno/central/diarios">←</Link>
      <h1>Exercício de Respiração</h1>
      <div className="breath-time">30 seg</div>
      <div className="breath-circle">
        <div className="breath-meter"><i/><i/><i/><i/><i/><i/><i/><i/><b/></div>
        <span>Nível de Respiração</span>
      </div>
      <p>{started ? 'Sustente o S até o final' : 'Prepare o ar e solte em S contínuo'}</p>
      <button type="button" onClick={() => setStarted(true)}>{started ? 'Em andamento' : 'Iniciar'}</button>
    </section>
  );
}

export function AdaptiveDailyTrainingPlayer({ step, exercise, total }: { step: DailyTrainingStep; exercise: TrainingExercise; total: number }) {
  const personalizedExercise = useMemo(() => personalizeDailyWarmup(exercise), [exercise]);
  if (step.exerciseNumber === 2) return <BreathVisualExperience step={step} />;
  return <DailyTrainingPlayer step={step} exercise={personalizedExercise} total={total} />;
}
