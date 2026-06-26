'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DailyTrainingStep } from '@/lib/training-center';
import { completeDailyStep, emptyDailyProgress, type DailyTrainingProgress } from '@/lib/daily-training-progress';
import './daily-training-completion-result.css';

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatClock(totalSeconds: number) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

const summaryIcons = ['♫', '♬', '◉', '▤', '♮', '◎'];
type SummaryMark = 'right' | 'wrong' | null;
type PitchSummary = { exercise?: number; correct: number; wrong: number; total: number; avgCents?: number; durationSeconds?: number; savedAt?: number } | null;

function readEarTrainingMarks(exerciseNumber: number): SummaryMark[] {
  try {
    const raw = sessionStorage.getItem('daily-ear-training-summary');
    if (!raw) return summaryIcons.map(() => null);
    const parsed = JSON.parse(raw) as { exercise?: number; marks?: SummaryMark[] };
    if (parsed.exercise !== exerciseNumber || !Array.isArray(parsed.marks)) return summaryIcons.map(() => null);
    return summaryIcons.map((_, index) => parsed.marks?.[index] ?? null);
  } catch {
    return summaryIcons.map(() => null);
  }
}

function readPitchSummary(exerciseNumber: number): PitchSummary {
  try {
    const raw = sessionStorage.getItem('daily-pitch-note-summary') || localStorage.getItem('daily-pitch-note-summary');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PitchSummary;
    if (!parsed || typeof parsed.correct !== 'number' || typeof parsed.wrong !== 'number') return null;
    if (parsed.exercise && parsed.exercise !== exerciseNumber) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function DailyTrainingCompletion({ step, total, next, durationSeconds }: { step: DailyTrainingStep; total: number; next?: DailyTrainingStep; durationSeconds: number }) {
  const [progress, setProgress] = useState<DailyTrainingProgress>(emptyDailyProgress());
  const [marks, setMarks] = useState<SummaryMark[]>(summaryIcons.map(() => null));
  const [pitchSummary, setPitchSummary] = useState<PitchSummary>(null);
  const level = (step as DailyTrainingStep & { level?: string }).level ?? 'Iniciante';
  const isPitchStep = step.exerciseSlug === 'sustentacao-centro-da-nota-01' || step.title.toLowerCase().includes('afinação');

  useEffect(() => {
    const nextProgress = completeDailyStep(step, durationSeconds);
    setProgress(nextProgress);
    setMarks(readEarTrainingMarks(step.exerciseNumber));
    setPitchSummary(readPitchSummary(step.exerciseNumber));
    window.dispatchEvent(new Event('daily-training-progress'));
  }, [durationSeconds, step]);

  const completedCount = progress.completedExercises.length;
  const pitchData = useMemo(() => {
    if (!isPitchStep && !pitchSummary) return null;
    const totalNotes = Math.max(1, pitchSummary?.total || 15);
    const correct = Math.max(0, pitchSummary?.correct || 0);
    const wrong = Math.max(0, pitchSummary?.wrong ?? Math.max(0, totalNotes - correct));
    const percent = Math.round((correct / totalNotes) * 100);
    const wrongPercent = Math.max(0, 100 - percent);
    const avg = typeof pitchSummary?.avgCents === 'number' ? Math.round(Math.abs(pitchSummary.avgCents)) : null;
    const time = pitchSummary?.durationSeconds || durationSeconds;
    const pin = avg == null ? 50 : Math.max(4, Math.min(96, (avg / 60) * 100));
    return { totalNotes, correct, wrong, percent, wrongPercent, avg, time, pin };
  }, [durationSeconds, isPitchStep, pitchSummary]);

  if (pitchData) {
    return (
      <div className="completion-result-screen">
        <header className="completion-result-top">
          <Link href="/aluno/central/diarios">Sair</Link>
          <strong>{level}</strong>
          <button type="button" aria-label="Informações">i</button>
        </header>

        <div className="completion-result-progress">
          <span>×</span>
          <div className="completion-result-track"><i /></div>
          <span>♙</span>
        </div>

        <section className="completion-hero">
          <div className="completion-check">✓</div>
          <h1>Exercício {step.exerciseNumber}<br />Concluído!</h1>
          <p>Você completou o exercício com sucesso.</p>
        </section>

        <section className="completion-stats-card" aria-label="Dados reais da atividade">
          <div className="completion-stat ok"><span className="completion-stat-icon">◎</span><label>Acertos</label><strong>{pitchData.correct}</strong><small>{pitchData.percent}%</small></div>
          <div className="completion-stat bad"><span className="completion-stat-icon">×</span><label>Erros</label><strong>{pitchData.wrong}</strong><small>{pitchData.wrongPercent}%</small></div>
          <div className="completion-stat precision"><span className="completion-stat-icon">⌁</span><label>Precisão média</label><strong>{pitchData.avg ?? '—'}</strong><small>centavos</small></div>
          <div className="completion-stat time"><span className="completion-stat-icon">◷</span><label>Tempo total</label><strong>{formatClock(pitchData.time)}</strong><small>min</small></div>
        </section>

        <section className="completion-performance">
          <h2>▮ Desempenho</h2>
          <p>{pitchData.percent >= 80 ? 'Você está no caminho certo!' : pitchData.percent >= 55 ? 'Boa base. Continue refinando o ouvido.' : 'Continue treinando: cada tentativa melhora sua precisão.'}</p>
          <div className="completion-scale" style={{ '--pin': `${pitchData.pin}%` } as CSSProperties}><i /></div>
          <div className="completion-scale-labels">
            <span><b>Iniciante</b>0 - 20 centavos</span>
            <span><b>Intermediário</b>20 - 40 centavos</span>
            <span><b>Avançado</b>40+ centavos</span>
          </div>
        </section>

        <section className="completion-quote">
          <b>“</b>
          <p>A afinação não é sorte, é treino e atenção.<br />Cada tentativa te <em>aproxima da excelência.</em><em>— Marcos Cruz</em></p>
        </section>

        <div className="completion-actions">
          <Link href={`/aluno/central/diarios/${step.exerciseNumber}`} prefetch>↻ Repetir exercício</Link>
          {next ? <Link className="primary" href={`/aluno/central/diarios/${next.exerciseNumber}`} prefetch>Próximo exercício →</Link> : <Link className="primary" href="/aluno/central/diarios/progresso" prefetch>Ver progresso →</Link>}
        </div>

        <div className="completion-steps">
          {[1, 2, 3, 4, 5].map((item) => <span key={item} className={item < step.exerciseNumber ? 'done' : item === step.exerciseNumber ? 'active' : ''}>{item}</span>)}
        </div>
      </div>
    );
  }

  return (
    <div className="done-premium-card">
      <div className="done-premium-medal"><span>♛</span><b>◇</b></div>

      <section className="done-premium-level">
        <h2>NÍVEL - {level}</h2>
        <div className="done-premium-icons" aria-label="Resumo das respostas">
          {summaryIcons.map((icon, index) => (
            <span key={`${icon}-${index}`} className={marks[index] === 'wrong' ? 'wrong' : marks[index] === 'right' ? 'right' : ''}>
              <i>{icon}</i>
              <b>{marks[index] === 'wrong' ? '×' : marks[index] === 'right' ? '✓' : '•'}</b>
            </span>
          ))}
        </div>
      </section>

      <div className="done-premium-divider"><i /></div>

      <section className="done-premium-quote">
        <strong>“</strong>
        <p>Acredite que você pode<br />e você já está<br /><em>no meio do caminho.</em></p>
        <small>— Marcos Cruz</small>
      </section>

      <div className="done-premium-stats">
        <span><b>{completedCount}/{total}</b><small>conclusão</small></span>
        <span><b>{progress.points}</b><small>pontos</small></span>
        <span><b>{formatSeconds(progress.totalSeconds)}</b><small>tempo</small></span>
      </div>

      {next ? (
        <Link className="done-premium-button" href={`/aluno/central/diarios/${next.exerciseNumber}`} prefetch>
          <span>◇</span><b>Continuar</b><i>›</i>
        </Link>
      ) : (
        <Link className="done-premium-button" href="/aluno/central/diarios/progresso" prefetch>
          <span>◇</span><b>Ver progresso</b><i>›</i>
        </Link>
      )}
    </div>
  );
}
