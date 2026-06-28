'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GuidedTrainingPlayer } from '@/components/guided-training-player';
import type { TrainingCategory, TrainingExercise } from '@/lib/training-center';

const EXTENSION_LOW = 'A2';
const EXTENSION_HIGH = 'A4';

const executionMap: Record<string, string> = {
  'Lip Trill': 'Vibração de lábios',
  Brrrr: 'Vibração de lábios',
  NG: 'Som nasal NG',
  Mum: 'Som “Mum”',
  Mmm: 'Boca fechada',
  Gee: 'Som “Gui”',
  Ney: 'Som “Ney”',
  Vvv: 'Vibração suave em V',
};

function executionLabel(exercise: TrainingExercise) {
  const first = exercise.notes.find((note) => note.label && note.mode !== 'guide')?.label || exercise.focus[0] || 'Vocalize';
  return executionMap[first] || first;
}

function totalSeconds(exercise: TrainingExercise) {
  return Math.ceil(Math.max(...exercise.notes.map((note) => note.start + note.duration), 0));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes <= 0) return `${remaining}s`;
  return `${minutes}min ${remaining ? `${remaining}s` : ''}`.trim();
}

const css = `.personalized-intro{min-height:100dvh;margin:-24px -16px 0;padding:calc(36px + env(safe-area-inset-top)) 22px calc(36px + env(safe-area-inset-bottom));color:#fff;background:radial-gradient(circle at 18% 4%,rgba(45,227,205,.11),transparent 22%),radial-gradient(circle at 82% 18%,rgba(245,199,107,.08),transparent 26%),linear-gradient(180deg,#071014 0%,#05080b 48%,#030405 100%);overflow:hidden}.intro-inner{max-width:760px;margin:0 auto}.intro-top{display:grid;grid-template-columns:46px 1fr 46px;align-items:center;margin-bottom:28px}.intro-top a,.intro-info{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.035);color:#ddd;display:grid;place-items:center;text-decoration:none;font-size:26px}.intro-title{text-align:center;text-transform:uppercase;letter-spacing:.30em;color:#31dfc9;font-size:13px;font-weight:950}.intro-card{position:relative;overflow:hidden;border:1px solid rgba(49,223,201,.22);border-radius:30px;padding:32px 28px;background:radial-gradient(circle at 18% 20%,rgba(49,223,201,.16),transparent 30%),linear-gradient(145deg,rgba(12,32,35,.82),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.32)}.intro-card:after{content:'';position:absolute;right:-34px;top:80px;width:320px;height:120px;background:repeating-radial-gradient(ellipse at center,rgba(49,223,201,.25) 0 1px,transparent 2px 9px);mask-image:linear-gradient(90deg,transparent,black 22%,black 75%,transparent);opacity:.45}.intro-kicker{position:relative;z-index:1;margin:0 0 14px;color:#31dfc9;text-transform:uppercase;letter-spacing:.22em;font-size:12px;font-weight:950}.intro-card h1{position:relative;z-index:1;margin:0;font-size:clamp(40px,8vw,58px);line-height:.98;letter-spacing:-.055em}.intro-card h1 span{color:#31dfc9}.intro-card p{position:relative;z-index:1;color:rgba(255,255,255,.70);font-size:17px;line-height:1.5;max-width:560px}.intro-grid{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.intro-metric{border:1px solid rgba(255,255,255,.09);border-radius:18px;background:rgba(255,255,255,.04);padding:14px}.intro-metric small{display:block;color:rgba(255,255,255,.52);font-size:11px;text-transform:uppercase;letter-spacing:.10em;font-weight:950}.intro-metric strong{display:block;margin-top:6px;color:#31dfc9;font-size:20px}.intro-list{position:relative;z-index:1;display:grid;gap:10px;margin:22px 0}.intro-list span{border:1px solid rgba(49,223,201,.18);border-radius:16px;background:rgba(49,223,201,.045);padding:13px 14px;color:rgba(255,255,255,.78);font-size:15px}.intro-list b{color:#31dfc9}.intro-start{position:relative;z-index:1;width:100%;height:62px;border:0;border-radius:999px;background:linear-gradient(180deg,#54f0df,#23c7b5);color:#041311;font-size:17px;font-weight:950;letter-spacing:.04em;text-transform:uppercase;box-shadow:0 0 34px rgba(49,223,201,.26);cursor:pointer}@media(max-width:640px){.personalized-intro{margin:-16px -12px 0;padding:calc(32px + env(safe-area-inset-top)) 20px calc(34px + env(safe-area-inset-bottom))}.intro-card{padding:28px 22px}.intro-card h1{font-size:38px}.intro-grid{grid-template-columns:1fr}.intro-card p{font-size:16px}}`;

export function PersonalizedExerciseShell({ exercise, category }: { exercise: TrainingExercise; category?: TrainingCategory }) {
  const [started, setStarted] = useState(false);
  const duration = totalSeconds(exercise);
  const label = executionLabel(exercise);

  if (started) return <GuidedTrainingPlayer exercise={exercise} />;

  return (
    <main className="personalized-intro">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="intro-inner">
        <header className="intro-top"><Link href={category ? `/aluno/central/personalizado/${category.slug}` : '/aluno/central/personalizado'} prefetch>‹</Link><div className="intro-title">Treino personalizado</div><div className="intro-info">i</div></header>
        <section className="intro-card">
          <p className="intro-kicker">{category?.title || 'Exercício guiado'} • {exercise.level}</p>
          <h1>{exercise.title}<br /><span>preparado para você.</span></h1>
          <p>Este treino foi organizado usando sua extensão vocal atual, para aquecer graves, médios e agudos com controle antes de desenvolver mais alcance.</p>
          <div className="intro-grid">
            <div className="intro-metric"><small>Extensão base</small><strong>{EXTENSION_LOW} → {EXTENSION_HIGH}</strong></div>
            <div className="intro-metric"><small>Duração</small><strong>{formatDuration(duration)}</strong></div>
            <div className="intro-metric"><small>Andamento</small><strong>{exercise.bpm} BPM</strong></div>
          </div>
          <div className="intro-list">
            <span><b>Execução:</b> {label}</span>
            <span><b>Objetivo:</b> {exercise.objective}</span>
            <span><b>Como cantar:</b> use pouco volume, não empurre ar e acompanhe as barras no tempo do metrônomo.</span>
          </div>
          <button className="intro-start" type="button" onClick={() => setStarted(true)}>Iniciar treino</button>
        </section>
      </div>
    </main>
  );
}
