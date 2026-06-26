'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type Status = 'idle' | 'right' | 'wrong';
type StepKey = 'different' | 'sing' | 'rhythm' | 'piano' | 'direction' | 'same';
type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
type AudioCtor = typeof AudioContext;
type WinAudio = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };

type Challenge = {
  different: { first: NoteName[]; second: NoteName[]; answerIndex: number };
  sing: { notes: NoteName[] };
  rhythm: { bpm: number };
  piano: { sequence: NoteName[] };
  direction: { notes: NoteName[]; answer: 'ascendente' | 'descendente' };
  same: { first: NoteName[]; second: NoteName[]; answer: 'igual' | 'diferente' };
};

const noteOrder: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const whiteKeys: NoteName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const blackKeys: NoteName[] = ['C#', 'D#', 'F#', 'G#', 'A#'];
const icons = ['♫', '▥', '◎', '▰', '♮', '◖'];
const keyOrder: StepKey[] = ['different', 'sing', 'rhythm', 'piano', 'direction', 'same'];

function seeded(daySeed: number) {
  let seed = daySeed || 1;
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function buildDailyChallenge(stepNumber: number): Challenge {
  const now = new Date();
  const key = Number(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${stepNumber}`);
  const rand = seeded(key);
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length) % items.length];
  const first: NoteName[] = [pick(['B', 'C', 'D', 'E', 'F', 'G'] as NoteName[]), pick(['C', 'D', 'E', 'F', 'G', 'A'] as NoteName[])];
  const answerIndex = Math.floor(rand() * 2);
  const second: NoteName[] = [...first];
  second[answerIndex] = pick(whiteKeys.filter((note) => note !== first[answerIndex]));
  const singRoot = pick(['C', 'D', 'E', 'F', 'G'] as NoteName[]);
  const singSecond = noteOrder[(noteOrder.indexOf(singRoot) + 7) % noteOrder.length];
  const sequence: NoteName[] = [pick(whiteKeys), pick(whiteKeys), pick(whiteKeys)];
  const directionRoot = pick(['C', 'D', 'E', 'F', 'G'] as NoteName[]);
  const goesUp = rand() > 0.5;
  const directionSecond = noteOrder[(noteOrder.indexOf(directionRoot) + (goesUp ? 4 : -3) + noteOrder.length) % noteOrder.length];
  const sameFirst: NoteName[] = [pick(whiteKeys), pick(whiteKeys), pick(whiteKeys)];
  const sameSecond: NoteName[] = [...sameFirst];
  const makeDifferent = rand() > 0.45;
  if (makeDifferent) {
    const idx = Math.floor(rand() * sameSecond.length);
    sameSecond[idx] = pick(whiteKeys.filter((note) => note !== sameSecond[idx]));
  }

  return {
    different: { first, second, answerIndex },
    sing: { notes: [singRoot, singSecond] },
    rhythm: { bpm: 72 + Math.floor(rand() * 28) },
    piano: { sequence },
    direction: { notes: [directionRoot, directionSecond], answer: goesUp ? 'ascendente' : 'descendente' },
    same: { first: sameFirst, second: sameSecond, answer: makeDifferent ? 'diferente' : 'igual' },
  };
}

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function midiFor(note: NoteName, octave = 4) { return noteNameToMidi(`${note}${octave}`) ?? 60; }
function frequencyToNote(freq: number): NoteName | null {
  if (!Number.isFinite(freq) || freq < 70) return null;
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return noteOrder[((midi % 12) + 12) % 12];
}
function detectPitch(buffer: Float32Array, sampleRate: number) {
  let bestOffset = -1;
  let bestCorrelation = 0;
  const size = buffer.length;
  const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / size);
  if (rms < 0.015) return null;
  for (let offset = 40; offset < 1000; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < size - offset; i += 1) correlation += 1 - Math.abs(buffer[i] - buffer[i + offset]);
    correlation /= size - offset;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }
  return bestCorrelation > 0.88 && bestOffset > 0 ? sampleRate / bestOffset : null;
}

export function DailyEarTrainingPlayer({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef(Date.now());
  const challenge = useMemo(() => buildDailyChallenge(step.exerciseNumber), [step.exerciseNumber]);
  const [current, setCurrent] = useState(0);
  const [status, setStatus] = useState<Record<StepKey, Status>>({ different: 'idle', sing: 'idle', rhythm: 'idle', piano: 'idle', direction: 'idle', same: 'idle' });
  const [selected, setSelected] = useState<string[]>([]);
  const [singDone, setSingDone] = useState<boolean[]>([]);
  const [rhythmHits, setRhythmHits] = useState<number[]>([]);
  const [rhythmStarted, setRhythmStarted] = useState(false);
  const [message, setMessage] = useState('');
  const key = keyOrder[current];
  const isResult = current >= keyOrder.length;
  const rightCount = Object.values(status).filter((item) => item === 'right').length;
  const level = rightCount >= 5 ? 'Intermediário' : 'Iniciante';

  function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      audioCtxRef.current = Ctor ? new Ctor() : null;
    }
    return audioCtxRef.current;
  }

  async function playTone(note: NoteName, duration = 620, octave = 4) {
    const context = getAudioContext();
    if (!context) return;
    await context.resume().catch(() => null);
    const midi = midiFor(note, octave);
    void preloadPianoSamples(context, [midi]);
    await playPianoSample(context, midi, context.currentTime + 0.025, context.currentTime + duration / 1000, 1.04);
    await sleep(duration + 60);
  }

  async function playSequence(notes: NoteName[], gap = 140, octave = 4) {
    const context = getAudioContext();
    if (context) void preloadPianoSamples(context, notes.map((note) => midiFor(note, octave)));
    for (const note of notes) {
      await playTone(note, 560, octave);
      await sleep(gap);
    }
  }

  async function playKick() {
    const ctx = getAudioContext();
    if (!ctx) return;
    await ctx.resume().catch(() => null);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(46, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.32, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
    await sleep(210);
  }

  function mark(value: Status) {
    setStatus((old) => ({ ...old, [key]: value }));
    setMessage(value === 'right' ? '✓' : '×');
    window.setTimeout(() => {
      setMessage('');
      setSelected([]);
      setRhythmHits([]);
      setSingDone([]);
      setRhythmStarted(false);
      setCurrent((old) => old + 1);
    }, 760);
  }

  function quit() {
    stopPianoSamples(audioCtxRef.current ?? undefined);
    router.push('/aluno/central/diarios');
  }

  function continueToList() {
    const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    completeDailyStep(step, duration);
    stopPianoSamples(audioCtxRef.current ?? undefined);
    router.push('/aluno/central/diarios');
  }

  async function listenFor(note: NoteName, index: number) {
    setMessage('cante...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      let ok = false;
      const started = performance.now();
      while (performance.now() - started < 2100) {
        analyser.getFloatTimeDomainData(buffer);
        const detected = frequencyToNote(detectPitch(buffer, ctx.sampleRate) || 0);
        if (detected === note) ok = true;
        await sleep(120);
      }
      stream.getTracks().forEach((track) => track.stop());
      await ctx.close().catch(() => null);
      if (!ok) return mark('wrong');
      const next = [...singDone];
      next[index] = true;
      setSingDone(next);
      setMessage('✓');
      if (next.filter(Boolean).length === challenge.sing.notes.length) mark('right');
      else window.setTimeout(() => setMessage(''), 450);
    } catch {
      setMessage('permita o microfone');
    }
  }

  async function startRhythm() {
    if (rhythmStarted) return;
    setRhythmStarted(true);
    setRhythmHits([]);
    const beatMs = Math.round(60000 / challenge.rhythm.bpm);
    for (let i = 0; i < 4; i += 1) {
      await playKick();
      await sleep(Math.max(60, beatMs - 210));
    }
    window.setTimeout(() => mark(rhythmHits.length >= 3 ? 'right' : 'wrong'), beatMs * 4 + 180);
  }

  function tapRhythm() {
    void playKick();
    setRhythmHits((old) => [...old, old.length]);
  }

  if (isResult) {
    return (
      <section className="ear-screen ear-result">
        <style>{css}</style>
        <div className="result-icons">{keyOrder.map((item, index) => <span key={item} className={status[item]}>{icons[index]}<b>{status[item] === 'right' ? '✓' : '×'}</b></span>)}</div>
        <h1>NÍVEL — {level}</h1>
        <p>Acredite que você pode e você já está no meio do caminho.</p>
        <small>- Theodore Roosevelt</small>
        <button type="button" onClick={continueToList}>Continuar ›</button>
      </section>
    );
  }

  return (
    <section className="ear-screen">
      <style>{css}</style>
      <div className="ear-top"><button type="button" onClick={quit}>Quit</button><span>{exercise.level}</span><i>i</i></div>
      <div className="ear-icons">{keyOrder.map((item, index) => <span key={item} className={`${index === current ? 'active' : ''} ${status[item]}`}>{icons[index]}<b>{status[item] === 'right' ? '✓' : status[item] === 'wrong' ? '×' : ''}</b></span>)}</div>
      <div className="ear-line" />
      {message ? <div className={`ear-feedback ${message === '×' ? 'bad' : ''}`}>{message}</div> : null}
      {key === 'different' ? <Different challenge={challenge} playSequence={playSequence} selected={selected} setSelected={setSelected} mark={mark} /> : null}
      {key === 'sing' ? <Sing challenge={challenge} playTone={playTone} listenFor={listenFor} singDone={singDone} /> : null}
      {key === 'rhythm' ? <Rhythm challenge={challenge} startRhythm={startRhythm} tapRhythm={tapRhythm} rhythmHits={rhythmHits} /> : null}
      {key === 'piano' ? <Piano challenge={challenge} playSequence={playSequence} playTone={playTone} selected={selected} setSelected={setSelected} mark={mark} /> : null}
      {key === 'direction' ? <Choice title="Ouça as duas notas" subtitle="Elas estão ascendentes ou descendentes?" play={() => playSequence(challenge.direction.notes)} options={[["ascendente", "ASCENDENTE"], ["descendente", "DESCENDENTE"]]} onAnswer={(answer) => mark(answer === challenge.direction.answer ? 'right' : 'wrong')} /> : null}
      {key === 'same' ? <Choice title="Ouça dois conjuntos de notas." subtitle="São iguais ou diferentes?" play={async () => { await playSequence(challenge.same.first); await sleep(360); await playSequence(challenge.same.second); }} options={[["igual", "IGUAL"], ["diferente", "DIFERENTE"]]} onAnswer={(answer) => mark(answer === challenge.same.answer ? 'right' : 'wrong')} /> : null}
    </section>
  );
}

function Different({ challenge, playSequence, selected, setSelected, mark }: { challenge: Challenge; playSequence: (notes: NoteName[]) => Promise<void>; selected: string[]; setSelected: (value: string[]) => void; mark: (value: Status) => void }) {
  return (
    <div className="ear-body different-body">
      <h2>Ouça dois conjuntos de notas.</h2>
      <p>Do 2º conjunto, selecione a nota que está fora do 1º conjunto</p>
      <div className="different-grid">
        <div className="sound-stack">
          <div><strong>1st</strong><button type="button" onClick={() => playSequence(challenge.different.first)}>🔊</button></div>
          <div><strong>2nd</strong><button type="button" onClick={() => playSequence(challenge.different.second)}>🔊</button></div>
        </div>
        <div className="note-choices">
          {challenge.different.first.map((note, index) => (
            <div className="reference-note" key={`ref-${note}-${index}`}><span>♪</span><b>{note}</b></div>
          ))}
          {challenge.different.second.map((note, index) => (
            <button type="button" key={`answer-${note}-${index}`} className={selected[0] === String(index) ? 'selected' : ''} onClick={() => setSelected([String(index)])} aria-label={`Nota ${index + 1} do segundo conjunto`}>
              <span>♪</span>
              <i />
            </button>
          ))}
        </div>
      </div>
      {selected.length ? <button type="button" className="chalk-action" onClick={() => mark(Number(selected[0]) === challenge.different.answerIndex ? 'right' : 'wrong')}>Enviar</button> : null}
    </div>
  );
}

function Sing({ challenge, playTone, listenFor, singDone }: { challenge: Challenge; playTone: (note: NoteName) => Promise<void>; listenFor: (note: NoteName, index: number) => void; singDone: boolean[] }) {
  return <div className="ear-body"><h2>Ouça e cante as mesmas notas</h2><div className="pitch-board">{noteOrder.slice(0, 12).reverse().map((note) => <div key={note}><span>{note}</span><i /></div>)}{challenge.sing.notes.map((note, index) => <button type="button" key={note} style={{ top: `${28 + index * 42}%`, left: `${index ? 74 : 28}%` }} onClick={async () => { await playTone(note); listenFor(note, index); }}>{singDone[index] ? '✓' : note}</button>)}</div><button type="button" className="sound-big" onClick={() => playSequenceSafe(challenge.sing.notes, playTone)}>🔊</button></div>;
}

async function playSequenceSafe(notes: NoteName[], playTone: (note: NoteName) => Promise<void>) { for (const note of notes) await playTone(note); }

function Rhythm({ challenge, startRhythm, tapRhythm, rhythmHits }: { challenge: Challenge; startRhythm: () => void; tapRhythm: () => void; rhythmHits: number[] }) {
  return <div className="ear-body"><h2>Observe a bateria</h2><p>toque seguindo o ritmo</p><div className="bpm">♩ = {challenge.rhythm.bpm}<br />4/4</div><div className="beat-box">{[0, 1, 2, 3].map((beat) => <i key={beat} className={rhythmHits[beat] != null ? 'on' : ''} />)}<b>{rhythmHits.length ? 'Perfect' : ''}</b></div><button type="button" className="sound-big" onClick={startRhythm}>🔊</button><button type="button" className="kick" onClick={tapRhythm}>bumbo</button></div>;
}

function Piano({ challenge, playSequence, playTone, selected, setSelected, mark }: { challenge: Challenge; playSequence: (notes: NoteName[]) => Promise<void>; playTone: (note: NoteName) => Promise<void>; selected: string[]; setSelected: (value: string[]) => void; mark: (value: Status) => void }) {
  const answer = selected.join(',') === challenge.piano.sequence.join(',');
  return <div className="ear-body"><h2>Ouça a sequência</h2><p>toque na ordem</p><div className="keyboard">{whiteKeys.map((note) => <button type="button" key={note} onClick={async () => { await playTone(note); if (selected.length < 3) setSelected([...selected, note]); }}>{note}</button>)}{blackKeys.map((note) => <b key={note}>{note}</b>)}</div><div className="slots">{[0, 1, 2].map((slot) => <button type="button" key={slot}>{selected[slot] || ''}</button>)}</div><button type="button" className="sound-big" onClick={() => playSequence(challenge.piano.sequence)}>🔊</button>{selected.length ? <button type="button" className="reset" onClick={() => setSelected([])}>Redefinir</button> : null}{selected.length === 3 ? <button type="button" className="chalk-action" onClick={() => mark(answer ? 'right' : 'wrong')}>Enviar</button> : null}</div>;
}

function Choice({ title, subtitle, play, options, onAnswer }: { title: string; subtitle: string; play: () => Promise<void>; options: string[][]; onAnswer: (answer: string) => void }) {
  const [choice, setChoice] = useState('');
  return <div className="ear-body"><h2>{title}</h2><p>{subtitle}</p><div className="choice-notes"><span>1st ♪</span><span>2nd ♪</span></div><button type="button" className="sound-big" onClick={play}>🔊</button><small>selecionar resposta</small><div className="choices">{options.map(([value, label]) => <button type="button" key={value} className={choice === value ? 'picked' : ''} onClick={() => setChoice(value)}>{label}</button>)}</div>{choice ? <button type="button" className="chalk-action" onClick={() => onAnswer(choice)}>Enviar</button> : null}</div>;
}

const css = `.ear-screen{min-height:100dvh;background:radial-gradient(circle at 24% 72%,rgba(255,255,255,.045),transparent 22%),radial-gradient(circle at 78% 46%,rgba(255,255,255,.04),transparent 21%),linear-gradient(180deg,#191919,#080808 72%,#050505);color:#fff;padding:calc(18px + env(safe-area-inset-top)) 30px calc(26px + env(safe-area-inset-bottom));position:relative;overflow:hidden;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace}.ear-screen:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 12%),repeating-linear-gradient(114deg,rgba(255,255,255,.018) 0 1px,transparent 1px 22px);opacity:.35;pointer-events:none}.ear-screen>*{position:relative;z-index:1}.ear-top{display:grid;grid-template-columns:98px 1fr 58px;align-items:center;gap:14px;min-height:58px}.ear-top button,.ear-top i{border:2px solid rgba(255,255,255,.82);background:rgba(255,255,255,.02);color:#fff;border-radius:999px;padding:10px 18px;font:900 20px system-ui,sans-serif;font-style:normal}.ear-top i{width:52px;height:52px;display:grid;place-items:center;padding:0;font-size:28px}.ear-top span{font-size:18px;color:rgba(255,255,255,.55);letter-spacing:.08em}.ear-icons{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin:28px 0 10px}.ear-icons span,.result-icons span{position:relative;display:grid;place-items:center;font-size:38px;color:rgba(255,255,255,.45);filter:grayscale(1);min-height:46px}.ear-icons span.active{color:#fff;text-shadow:0 0 16px #fff;filter:none}.ear-icons b,.result-icons b{position:absolute;right:6px;bottom:-19px;font-size:30px;color:#00dc64;text-shadow:none}.ear-icons .wrong b,.result-icons .wrong b{color:#ff1c1c}.ear-line{height:1px;background:rgba(255,255,255,.52);margin:0 0 50px}.ear-body h2{font-size:clamp(28px,8.8vw,42px);line-height:1.02;margin:0 auto 16px;font-weight:900;letter-spacing:.01em;max-width:700px}.ear-body p{font-size:clamp(19px,5vw,28px);line-height:1.18;color:rgba(255,255,255,.78);margin:0 auto 42px;max-width:720px}.different-grid{display:grid;grid-template-columns:112px 1fr;gap:28px;align-items:start;margin-top:76px}.sound-stack{display:grid;gap:62px;justify-items:start}.sound-stack div{display:grid;gap:8px;justify-items:center}.sound-stack strong{font-size:30px;font-weight:900;color:#fff}.sound-stack button{width:76px;height:76px;border-radius:50%;border:2px solid rgba(255,255,255,.95);background:rgba(255,255,255,.03);color:#fff;font-size:30px;box-shadow:0 0 18px rgba(255,255,255,.08)}.note-choices{display:grid;grid-template-columns:repeat(2,minmax(96px,1fr));grid-template-rows:116px 116px;column-gap:54px;row-gap:34px;align-items:center}.reference-note,.note-choices button{display:grid;place-items:center;border:0;background:transparent;color:rgba(255,255,255,.78);min-width:90px}.reference-note span,.note-choices button span{font-size:66px;line-height:.8;color:rgba(255,255,255,.74)}.reference-note b{font-size:30px;margin-top:10px}.note-choices button i{width:38px;height:38px;border:3px solid rgba(255,255,255,.72);border-radius:50%;margin-top:12px;display:block}.note-choices button.selected span{color:#fff;text-shadow:0 0 18px #fff}.note-choices button.selected i{background:rgba(255,255,255,.9);box-shadow:0 0 18px rgba(255,255,255,.55)}.chalk-action,.reset{position:absolute;right:30px;bottom:calc(24px + env(safe-area-inset-bottom));border:0;background:transparent;color:#fff;font:900 34px ui-monospace,SFMono-Regular,monospace;text-shadow:0 0 18px #fff}.reset{left:30px;right:auto;font-size:29px}.sound-big{width:92px;height:92px;border-radius:50%;border:3px solid #fff;background:rgba(255,255,255,.04);color:#fff;font-size:34px;box-shadow:0 0 28px rgba(255,255,255,.16)}.picked{color:#fff!important;text-shadow:0 0 18px #fff!important}.pitch-board{position:relative;margin:36px 0 18px}.pitch-board div{display:grid;grid-template-columns:42px 1fr;align-items:center;height:36px;color:rgba(255,255,255,.55);font-weight:900}.pitch-board i{height:1px;background:rgba(255,255,255,.38)}.pitch-board button{position:absolute;width:64px;height:64px;border-radius:50%;border:3px solid #eee;background:rgba(255,255,255,.08);color:#fff;font-weight:900}.bpm{position:absolute;left:28px;top:230px;font-size:30px;text-align:left}.beat-box{width:min(610px,82vw);height:230px;border:2px solid rgba(255,255,255,.62);border-radius:30px;margin:70px auto 24px;display:flex;align-items:flex-start;justify-content:center;gap:48px;padding-top:42px;background:rgba(255,255,255,.05)}.beat-box i{width:16px;height:48px;border:1px solid rgba(255,255,255,.45);display:block}.beat-box i.on{background:#fff;box-shadow:0 0 24px #fff}.beat-box b{position:absolute;margin-top:110px;font-size:28px}.kick{display:block;margin:12px auto 0;width:108px;height:108px;border-radius:50%;border:4px solid rgba(255,255,255,.82);background:rgba(255,255,255,.16);color:#fff;text-transform:uppercase}.keyboard{position:relative;display:grid;grid-template-columns:repeat(7,1fr);height:220px;border:2px solid rgba(255,255,255,.48);border-radius:22px;padding:42px 22px 28px;margin:32px 0}.keyboard button{background:linear-gradient(#fff,#dcdcdc);color:#111;border:1px solid #555;font-size:22px;font-weight:900;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px}.keyboard b{position:absolute;top:22px;width:48px;height:120px;background:linear-gradient(#000,#444);padding-top:10px}.keyboard b:nth-of-type(1){left:17%}.keyboard b:nth-of-type(2){left:29%}.keyboard b:nth-of-type(3){left:55%}.keyboard b:nth-of-type(4){left:67%}.keyboard b:nth-of-type(5){left:79%}.slots{display:flex;justify-content:center;gap:28px;margin-top:34px}.slots button{width:72px;height:72px;border-radius:50%;border:3px solid #fff;background:transparent;color:#fff;font-size:28px}.choice-notes{height:220px;display:flex;align-items:center;justify-content:center;gap:120px;font-size:34px}.choices{display:flex;justify-content:center;gap:24px;align-items:center}.choices button{border:0;background:transparent;color:rgba(255,255,255,.65);font-weight:950;font-size:clamp(25px,8vw,42px)}.ear-body small{display:block;margin:18px 0 8px;color:rgba(255,255,255,.45);font-size:20px}.ear-feedback{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:92px;color:#00db62;text-shadow:0 0 24px #00db62;z-index:5;font-weight:950}.ear-feedback.bad{color:#ff2020;text-shadow:0 0 24px #ff2020}.result-icons{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:112px 0 120px}.ear-result h1{font-size:30px;margin:0 0 170px}.ear-result p{font:800 26px system-ui,sans-serif;line-height:1.25;max-width:640px;margin:0 auto 26px}.ear-result small{font:900 24px system-ui,sans-serif}.ear-result button{position:absolute;right:32px;bottom:calc(38px + env(safe-area-inset-bottom));border:0;background:transparent;color:#fff;font-size:38px;text-shadow:0 0 18px #fff}@media(max-width:520px){.ear-screen{padding-left:28px;padding-right:28px}.ear-top{grid-template-columns:84px 1fr 54px}.ear-top button{font-size:17px;padding:9px 16px}.ear-icons{gap:10px;margin-top:26px}.ear-icons span{font-size:32px}.ear-line{margin-bottom:46px}.different-grid{grid-template-columns:84px 1fr;gap:22px;margin-top:62px}.sound-stack{gap:62px}.sound-stack button{width:66px;height:66px;font-size:26px}.sound-stack strong{font-size:26px}.note-choices{column-gap:42px;row-gap:34px;grid-template-rows:104px 104px}.reference-note span,.note-choices button span{font-size:58px}.reference-note b{font-size:28px}.chalk-action{font-size:31px}.bpm{top:210px}.choice-notes{gap:86px}.keyboard{height:204px;padding-left:18px;padding-right:18px}.ear-result p{font-size:22px}}`;
