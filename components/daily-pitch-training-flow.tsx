'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';
import './daily-pitch-note-replica.css';

type AudioCtor = typeof AudioContext;
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type Phase = 'ready' | 'playing' | 'recording' | 'result';
type TargetNote = { name: string; display: string; midi: number; hz: number };
type VoiceSample = { name: string; display: string; centsToTarget: number };
type Result = { ok: boolean; sungName: string; sungDisplay: string; cents: number } | null;

const PT: Record<string, string> = { C: 'Dó', 'C#': 'Dó#', D: 'Ré', 'D#': 'Ré#', E: 'Mi', F: 'Fá', 'F#': 'Fá#', G: 'Sol', 'G#': 'Sol#', A: 'Lá', 'A#': 'Lá#', B: 'Si' };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const RECORD_SECONDS = 2.1;
const PASS_CENTS = 50;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const cents = (freq: number, target: number) => 1200 * Math.log2(freq / target);
const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const midiName = (midi: number) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
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
  const sampleCtxRef = useRef<AudioContext | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(Date.now());
  const samplesRef = useRef<VoiceSample[]>([]);
  const progressRef = useRef<HTMLButtonElement | null>(null);
  const target = targets[index] ?? targets[0];
  const overall = `${((index + (phase === 'result' ? 1 : recordProgress)) / targets.length) * 100}%`;

  useEffect(() => {
    const ctx = getSampleContext();
    if (ctx) void preloadPianoSamples(ctx, targets.map((item) => item.midi));
    const timer = window.setTimeout(() => void playCurrent(true), 320);
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

  async function playCurrent(autoRecord = false) {
    const ctx = getSampleContext();
    if (!ctx || !target) return;
    stopCapture();
    setResult(null);
    setPhase('playing');
    setRecordProgress(0);
    paintRecordProgress(0);
    await ctx.resume().catch(() => null);
    stopPianoSamples(ctx);
    await preloadPianoSamples(ctx, [target.midi]).catch(() => null);
    await playPianoSample(ctx, target.midi, ctx.currentTime + 0.04, ctx.currentTime + 2.85, 1.08).catch(() => null);
    await wait(2300);
    if (autoRecord) void startCapture();
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

  async function startCapture() {
    if (!target) return;
    stopCapture();
    samplesRef.current = [];
    setPhase('recording');
    setRecordProgress(0);
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
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        analyser.getFloatTimeDomainData(data);
        const pitch = getPitch(data, ctx.sampleRate);
        if (pitch) {
          heardSeconds = Math.min(RECORD_SECONDS, heardSeconds + delta);
          samplesRef.current.push(nearestTarget(pitch, target));
        }
        const progress = clamp(heardSeconds / RECORD_SECONDS, 0, 1);
        setRecordProgress(progress);
        paintRecordProgress(progress);
        if (heardSeconds >= RECORD_SECONDS) {
          finishAttempt();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setPhase('ready');
    }
  }

  function finishAttempt() {
    stopCapture();
    const finalResult = summarize(samplesRef.current, target);
    setResult(finalResult);
    setHistory((current) => [...current.slice(0, index), finalResult]);
    setPhase('result');
  }

  function repeat() {
    samplesRef.current = [];
    setResult(null);
    void playCurrent(true);
  }

  function nextNote() {
    stopCapture();
    samplesRef.current = [];
    setResult(null);
    setRecordProgress(0);
    paintRecordProgress(0);
    if (index >= targets.length - 1) {
      completeDailyStep(step, Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
      router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
      return;
    }
    setIndex((current) => current + 1);
    setPhase('ready');
    window.setTimeout(() => void playCurrent(true), 120);
  }

  const isResult = phase === 'result' && result;
  const statusText = result?.ok ? 'Excelente!' : 'Por pouco!';
  const resultDescription = result?.ok ? 'A nota que você cantou corresponde à nota alvo.' : 'A nota que você cantou foi diferente da nota alvo.';
  const centsDirection = result ? result.cents < 0 ? 'baixo' : result.cents > 0 ? 'acima' : 'no centro' : 'no centro';
  const activeStepDots = [0, 1, 2, 3, 4].map((item) => Math.min(targets.length, Math.round(1 + item * 3.5)));

  return (
    <section className={`note-rep-screen ${isResult ? 'note-result-mode' : ''}`}>
      <div className="note-rep-inner">
        <header className="note-rep-top">
          <Link href="/aluno/central/diarios">Sair</Link>
          <strong>Iniciante</strong>
          <button type="button" aria-label="Informações">i</button>
        </header>

        <div className="note-rep-progress" style={{ '--overall': overall } as CSSProperties}>
          <span>×</span>
          <div className="note-rep-track"><i /></div>
          <span>♙</span>
        </div>

        <div className="note-rep-title">
          <span>Afinação</span>
          <h1>Exercício 1</h1>
          <p>Ouça o som e reproduza a mesma nota.</p>
        </div>

        <div className="note-target-card">
          <div>
            <span className="note-label">Nota alvo</span>
            <strong className="note-target-name">{target.display}</strong>
            <button className="note-sound-button" type="button" onClick={() => void playCurrent(false)} aria-label="Repetir nota alvo">🔊</button>
          </div>
          <div className={`note-wave ${phase === 'playing' ? 'is-playing' : ''}`} aria-hidden="true">
            {Array.from({ length: 44 }, (_, i) => <i key={i} style={{ '--h': 8 + ((i * 17) % 36), '--d': i } as CSSProperties} />)}
          </div>
        </div>

        {!isResult && <p className="note-prompt">{phase === 'recording' ? 'Gravando sua voz...' : phase === 'playing' ? 'Ouça com atenção.' : 'Cante a nota que você ouviu.'}</p>}

        {!isResult && (
          <div className="note-mic-wrap">
            <button ref={progressRef} className={`note-mic-ring ${phase === 'recording' ? 'is-recording' : ''}`} type="button" onClick={() => phase === 'recording' ? finishAttempt() : void startCapture()} aria-label="Gravar resposta">
              <b>🎙</b>
            </button>
          </div>
        )}

        {isResult && (
          <>
            <p className="note-prompt">Você cantou. Vamos ver como foi:</p>
            <div className={`note-result-card ${result.ok ? 'ok' : ''}`}>
              <div>
                <span className="note-label">Sua nota</span>
                <strong className="note-target-name">{result.sungDisplay}</strong>
                <button className="note-sound-button" type="button" onClick={() => void playCurrent(false)} aria-label="Ouvir nota alvo">🔊</button>
              </div>
              <div className="note-result-text">
                <strong>{result.ok ? '✓' : '×'} {statusText}</strong>
                <p>{resultDescription}</p>
              </div>
              <div className="note-wave is-playing" aria-hidden="true">
                {Array.from({ length: 38 }, (_, i) => <i key={i} style={{ '--h': 8 + ((i * 23) % 37), '--d': i } as CSSProperties} />)}
              </div>
              <div className="note-diff">
                <strong>Diferença: {result.cents > 0 ? '+' : ''}{result.cents} centavos ({centsDirection})</strong>
                <span>{result.cents === 0 ? 'Sua nota ficou exatamente no centro.' : `Sua nota está ${Math.abs(result.cents)} centavos ${centsDirection} da nota alvo.`}</span>
              </div>
            </div>
          </>
        )}

        <div className="note-tip">
          <strong>💡 Dica</strong>
          <span>{isResult ? 'Respire, escute e tente novamente.' : 'Concentre-se no timbre e na altura do som.'}</span>
        </div>

        <div className="note-actions">
          <button type="button" onClick={repeat}>↻ Repetir</button>
          <button type="button" onClick={nextNote}>▶ {index >= targets.length - 1 ? 'Concluir' : 'Pular'}</button>
        </div>

        <div className="note-steps" aria-label={`Nota ${index + 1} de ${targets.length}`}>
          {activeStepDots.map((value, dotIndex) => <span key={dotIndex} className={index + 1 >= value ? 'active' : ''}>{dotIndex + 1}</span>)}
        </div>

        {isResult && (
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
