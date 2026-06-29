'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';
import './daily-pitch-note-replica.css';
import './daily-pitch-note-replica-fixes.css';

type AudioCtor = typeof AudioContext;
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type Phase = 'ready' | 'playing' | 'recording' | 'result';
type TargetNote = { name: string; display: string; midi: number; hz: number };
type VoiceSample = { name: string; display: string; centsToTarget: number };
type Result = { ok: boolean; sungName: string; sungDisplay: string; cents: number } | null;
type TrailPoint = { id: number; x: number; ok: boolean };

const PT: Record<string, string> = { C: 'Dó', 'C#': 'Dó#', D: 'Ré', 'D#': 'Ré#', E: 'Mi', F: 'Fá', 'F#': 'Fá#', G: 'Sol', 'G#': 'Sol#', A: 'Lá', 'A#': 'Lá#', B: 'Si' };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const RECORD_SECONDS = 2.15;
const PASS_CENTS = 50;
const SILENCE_RESET_SECONDS = 0.22;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const cents = (freq: number, target: number) => 1200 * Math.log2(freq / target);
const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const midiName = (midi: number) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const centsToX = (centValue: number | null) => `${50 + clamp(centValue ?? 0, -1200, 1200) / 24}%`;
const displayName = (name: string) => {
  const match = name.match(/^([A-G]#?)(-?\d)$/);
  return match ? `${PT[match[1]] ?? match[1]}${match[2]}` : name;
};
const makeTarget = (midi: number): TargetNote => {
  const name = midiName(midi);
  return { name, display: displayName(name), midi, hz: midiHz(midi) };
};
function rng(seed: number) {
  let value = seed || 1;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}
function getAudioCtor() {
  if (typeof window === 'undefined') return null;
  return (window as AudioWindow).AudioContext || (window as AudioWindow).webkitAudioContext || null;
}
function getPitch(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
  if (Math.sqrt(rms / buffer.length) < 0.012) return null;
  let bestLag = -1;
  let best = 0;
  const minLag = Math.floor(sampleRate / 900);
  const maxLag = Math.floor(sampleRate / 70);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    let energy = 0;
    for (let i = 0; i < buffer.length - lag; i += 1) {
      sum += buffer[i] * buffer[i + lag];
      energy += buffer[i] * buffer[i] + buffer[i + lag] * buffer[i + lag];
    }
    const corr = energy > 0 ? (2 * sum) / energy : 0;
    if (corr > best) {
      best = corr;
      bestLag = lag;
    }
  }
  return bestLag > 0 && best > 0.19 ? sampleRate / bestLag : null;
}
function nearestTarget(freq: number, target: TargetNote): VoiceSample {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = midiName(midi);
  return { name, display: displayName(name), centsToTarget: cents(freq, target.hz) };
}
function summarize(samples: VoiceSample[], target: TargetNote): Result {
  if (!samples.length) return { ok: false, sungName: '—', sungDisplay: '—', cents: 0 };
  const counts = samples.reduce<Record<string, number>>((acc, item) => {
    acc[item.name] = (acc[item.name] ?? 0) + 1;
    return acc;
  }, {});
  const sungName = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? samples[0].name;
  const related = samples.filter((item) => item.name === sungName);
  const avg = related.reduce((sum, item) => sum + item.centsToTarget, 0) / Math.max(1, related.length);
  const rounded = Math.round(avg);
  return { ok: sungName === target.name && Math.abs(rounded) <= PASS_CENTS, sungName, sungDisplay: displayName(sungName), cents: rounded };
}
function makeSequence(seed: number) {
  const random = rng(seed);
  const low = 48;
  const high = 68;
  const pool = Array.from({ length: high - low + 1 }, (_, index) => low + index).filter((midi) => ![1, 3, 6, 8, 10].includes(midi % 12) || random() > 0.42);
  const result: TargetNote[] = [];
  for (let i = 0; i < 15; i += 1) {
    const previous = result.at(-1)?.midi;
    const options = pool.filter((midi) => midi !== previous && (!previous || Math.abs(midi - previous) <= 7));
    result.push(makeTarget(options[Math.floor(random() * options.length) % options.length] ?? pool[0]));
  }
  return result;
}

export function DailyPitchTrainingFlow({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const seed = useMemo(() => [...exercise.slug, String(step.day), String(step.exerciseNumber)].reduce((sum, char) => sum + char.charCodeAt(0), 0), [exercise.slug, step.day, step.exerciseNumber]);
  const targets = useMemo(() => makeSequence(seed), [seed]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [recordProgress, setRecordProgress] = useState(0);
  const [result, setResult] = useState<Result>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [liveCents, setLiveCents] = useState<number | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const sampleCtxRef = useRef<AudioContext | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(Date.now());
  const samplesRef = useRef<VoiceSample[]>([]);
  const progressRef = useRef<HTMLButtonElement | null>(null);
  const activeTargetRef = useRef<TargetNote | null>(null);
  const target = targets[index] ?? targets[0];
  const overall = `${((index + (phase === 'result' ? 1 : recordProgress)) / targets.length) * 100}%`;
  const correctCount = history.filter((item) => item?.ok).length;
  const wrongCount = history.filter((item) => item && !item.ok).length;
  const liveX = centsToX(liveCents);

  useEffect(() => {
    const ctx = getSampleContext();
    if (ctx) void preloadPianoSamples(ctx, targets.map((item) => item.midi));
    const firstTarget = targets[0];
    const timer = window.setTimeout(() => {
      if (firstTarget) void playCurrent(true, firstTarget);
    }, 320);
    return () => {
      window.clearTimeout(timer);
      stopCapture();
      stopPianoSamples(sampleCtxRef.current ?? undefined);
    };
  }, [targets]);

  function getSampleContext() {
    if (sampleCtxRef.current) return sampleCtxRef.current;
    const Ctor = getAudioCtor();
    sampleCtxRef.current = Ctor ? new Ctor() : null;
    return sampleCtxRef.current;
  }

  function paintRecordProgress(value: number) {
    progressRef.current?.style.setProperty('--record-progress', `${(clamp(value, 0, 1) * 360).toFixed(2)}deg`);
  }

  async function playCurrent(autoRecord = false, noteToPlay = target) {
    const ctx = getSampleContext();
    if (!ctx || !noteToPlay) return;
    stopCapture();
    activeTargetRef.current = noteToPlay;
    setResult(null);
    setLiveCents(null);
    setTrail([]);
    setPhase('playing');
    setRecordProgress(0);
    paintRecordProgress(0);
    await ctx.resume().catch(() => null);
    stopPianoSamples(ctx);
    await preloadPianoSamples(ctx, [noteToPlay.midi]).catch(() => null);
    await playPianoSample(ctx, noteToPlay.midi, ctx.currentTime + 0.04, ctx.currentTime + 3.72, 1.08).catch(() => null);
    await wait(3100);
    if (autoRecord) void startCapture(noteToPlay);
    else setPhase('ready');
  }

  function stopCapture() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void micCtxRef.current?.close().catch(() => null);
    rafRef.current = null;
    streamRef.current = null;
    micCtxRef.current = null;
  }

  async function startCapture(noteToCapture = target) {
    if (!noteToCapture) return;
    stopCapture();
    activeTargetRef.current = noteToCapture;
    samplesRef.current = [];
    setPhase('recording');
    setRecordProgress(0);
    setLiveCents(null);
    setTrail([]);
    paintRecordProgress(0);
    try {
      const Ctor = getAudioCtor();
      if (!Ctor) throw new Error('AudioContext indisponível');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.04;
      source.connect(analyser);
      streamRef.current = stream;
      micCtxRef.current = ctx;
      const data = new Float32Array(analyser.fftSize);
      let heardSeconds = 0;
      let silentSeconds = 0;
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        analyser.getFloatTimeDomainData(data);
        const pitch = getPitch(data, ctx.sampleRate);
        if (pitch) {
          silentSeconds = 0;
          heardSeconds = Math.min(RECORD_SECONDS, heardSeconds + delta);
          const voice = nearestTarget(pitch, noteToCapture);
          samplesRef.current.push(voice);
          setLiveCents(voice.centsToTarget);
          const x = 50 + clamp(voice.centsToTarget, -1200, 1200) / 24;
          setTrail((current) => [...current.slice(-13), { id: now + Math.random(), x, ok: Math.abs(voice.centsToTarget) <= PASS_CENTS }]);
        } else {
          silentSeconds += delta;
          setLiveCents(null);
          if (silentSeconds >= SILENCE_RESET_SECONDS) {
            heardSeconds = 0;
            samplesRef.current = [];
            setTrail([]);
          } else {
            heardSeconds = Math.max(0, heardSeconds - delta * 5);
          }
        }
        const progress = clamp(heardSeconds / RECORD_SECONDS, 0, 1);
        setRecordProgress(progress);
        paintRecordProgress(progress);
        if (heardSeconds >= RECORD_SECONDS) {
          finishAttempt(noteToCapture);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setPhase('ready');
    }
  }

  function finishAttempt(noteToFinish = activeTargetRef.current ?? target) {
    stopCapture();
    setLiveCents(null);
    const finalResult = summarize(samplesRef.current, noteToFinish);
    setResult(finalResult);
    setHistory((current) => [...current.slice(0, index), finalResult]);
    setPhase('result');
  }

  function repeat() {
    samplesRef.current = [];
    setResult(null);
    setLiveCents(null);
    setTrail([]);
    void playCurrent(true, target);
  }

  function nextNote() {
    stopCapture();
    samplesRef.current = [];
    setResult(null);
    setLiveCents(null);
    setTrail([]);
    setRecordProgress(0);
    paintRecordProgress(0);
    if (index >= targets.length - 1) {
      const summary = { correct: correctCount, wrong: wrongCount, total: targets.length, savedAt: Date.now() };
      try { sessionStorage.setItem('daily-pitch-note-summary', JSON.stringify(summary)); } catch {}
      completeDailyStep(step, Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
      router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
      return;
    }
    const nextIndex = index + 1;
    const nextTarget = targets[nextIndex];
    setIndex(nextIndex);
    setPhase('ready');
    window.setTimeout(() => {
      if (nextTarget) void playCurrent(true, nextTarget);
    }, 120);
  }

  const currentResult = phase === 'result' ? result : null;
  const statusText = currentResult?.ok ? 'Excelente!' : 'Por pouco!';
  const resultDescription = currentResult?.ok ? 'A nota que você cantou corresponde à nota alvo.' : 'A nota que você cantou foi diferente da nota alvo.';
  const centsDirection = currentResult ? currentResult.cents < 0 ? 'baixo' : currentResult.cents > 0 ? 'acima' : 'no centro' : 'no centro';
  const activeStepDots = [0, 1, 2, 3, 4].map((item) => Math.min(targets.length, Math.round(1 + item * 3.5)));

  return (
    <section className={`note-rep-screen ${currentResult ? 'note-result-mode' : ''}`}>
      <div className="note-rep-inner">
        <header className="note-rep-top">
          <Link href="/aluno/central/diarios">Sair</Link>
          <strong>{exercise.level}</strong>
          <button type="button" aria-label="Informações">i</button>
        </header>

        <div className="note-rep-progress" style={{ '--overall': overall } as CSSProperties}>
          <span>×</span>
          <div className="note-rep-track"><i /></div>
          <span>♙</span>
        </div>

        <div className="note-rep-title">
          <span>{step.title}</span>
          <h1>Exercício {step.exerciseNumber}</h1>
          <p>{step.intro || exercise.objective}</p>
        </div>

        <div className="note-target-card">
          <div>
            <span className="note-label">Nota alvo</span>
            <strong className="note-target-name">{target.display}</strong>
            <button className="note-sound-button" type="button" onClick={() => void playCurrent(false, target)} aria-label="Repetir nota alvo">🔊</button>
          </div>
          <div className={`note-wave ${phase === 'playing' ? 'is-playing' : ''}`} aria-hidden="true">
            {Array.from({ length: 44 }, (_, i) => <i key={i} style={{ '--h': 8 + ((i * 17) % 36), '--d': i } as CSSProperties} />)}
          </div>
        </div>

        {!currentResult && <p className="note-prompt">{phase === 'recording' ? 'Sustente a nota até completar o círculo.' : phase === 'playing' ? 'Ouça com atenção.' : 'Cante a nota que você ouviu.'}</p>}

        {!currentResult && (
          <div className="note-live-tuner" style={{ '--live-x': liveX, '--live-visible': liveCents == null ? 0 : 1 } as CSSProperties}>
            <span>Muito grave</span><span>Centro</span><span>Muito agudo</span>
            <div className="note-live-lane">
              <i className="center" />
              {trail.map((point, pointIndex) => <b key={point.id} className={point.ok ? 'ok' : ''} style={{ left: `${point.x}%`, opacity: 0.18 + pointIndex / Math.max(1, trail.length) * 0.62 } as CSSProperties} />)}
              <em />
            </div>
          </div>
        )}

        {!currentResult && (
          <div className="note-mic-wrap">
            <button ref={progressRef} className={`note-mic-ring ${phase === 'recording' ? 'is-recording' : ''}`} type="button" onClick={() => phase === 'recording' ? finishAttempt() : void startCapture(target)} aria-label="Gravar resposta">
              <b>🎙</b>
            </button>
          </div>
        )}

        {currentResult && (
          <>
            <p className="note-prompt">Você cantou. Vamos ver como foi:</p>
            <div className={`note-result-card ${currentResult.ok ? 'ok' : ''}`}>
              <div>
                <span className="note-label">Sua nota</span>
                <strong className="note-target-name">{currentResult.sungDisplay}</strong>
                <button className="note-sound-button" type="button" onClick={() => void playCurrent(false, target)} aria-label="Ouvir nota alvo">🔊</button>
              </div>
              <div className="note-result-text">
                <strong>{currentResult.ok ? '✓' : '×'} {statusText}</strong>
                <p>{resultDescription}</p>
              </div>
              <div className="note-wave is-playing" aria-hidden="true">
                {Array.from({ length: 38 }, (_, i) => <i key={i} style={{ '--h': 8 + ((i * 23) % 37), '--d': i } as CSSProperties} />)}
              </div>
              <div className="note-diff">
                <strong>Diferença: {currentResult.cents > 0 ? '+' : ''}{currentResult.cents} centavos ({centsDirection})</strong>
                <span>{currentResult.cents === 0 ? 'Sua nota ficou exatamente no centro.' : `Sua nota está ${Math.abs(currentResult.cents)} centavos ${centsDirection} da nota alvo.`}</span>
              </div>
            </div>
          </>
        )}

        {currentResult && <div className="note-rep-summary">Parcial: <b>{correctCount}</b> acerto(s) · <i>{wrongCount}</i> erro(s)</div>}

        <div className="note-tip">
          <strong>💡 Dica</strong>
          <span>{currentResult ? 'Respire, escute e tente novamente.' : 'Concentre-se no timbre e na altura do som.'}</span>
        </div>

        <div className="note-actions">
          <button type="button" onClick={repeat}>↻ Repetir</button>
          <button type="button" onClick={nextNote}>▶ {index >= targets.length - 1 ? 'Concluir' : 'Pular'}</button>
        </div>

        <div className="note-steps" aria-label={`Nota ${index + 1} de ${targets.length}`}>
          {activeStepDots.map((value, dotIndex) => <span key={dotIndex} className={index + 1 >= value ? 'active' : ''}>{dotIndex + 1}</span>)}
        </div>

        {currentResult && (
          <div className="note-quote">
            <b>“</b>
            <span>A afinação não é sorte, é treino e atenção.<br />Cada tentativa te aproxima da excelência.</span>
            <em>— Marcos Cruz</em>
          </div>
        )}
      </div>
    </section>
  );
}
