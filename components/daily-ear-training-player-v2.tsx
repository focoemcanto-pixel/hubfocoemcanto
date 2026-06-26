'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
type Status = 'idle' | 'right' | 'wrong';
type Key = 'different' | 'sing' | 'rhythm' | 'piano' | 'direction' | 'same';
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

const order: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const white: NoteName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const keys: Key[] = ['different', 'sing', 'rhythm', 'piano', 'direction', 'same'];
const icons = ['♫', '▥', '◎', '▰', '♮', '◖'];
const staff = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'] as NoteName[];

function rand(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function dailyChallenge(step: number): Challenge {
  const now = new Date();
  const r = rand(Number(`${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}${step}`));
  const pick = <T,>(items: T[]) => items[Math.floor(r() * items.length) % items.length];
  const first: NoteName[] = [pick(['B', 'C', 'D', 'E', 'F', 'G'] as NoteName[]), pick(['C', 'D', 'E', 'F', 'G', 'A'] as NoteName[])];
  const answerIndex = Math.floor(r() * 2);
  const second: NoteName[] = [...first];
  second[answerIndex] = pick(white.filter((note) => note !== first[answerIndex]));
  const root = pick(['C', 'D', 'E', 'F', 'G'] as NoteName[]);
  const directionUp = r() > 0.5;
  const directionSecond = order[(order.indexOf(root) + (directionUp ? 4 : -3) + order.length) % order.length];
  const sameFirst = [pick(white), pick(white), pick(white)];
  const sameSecond = [...sameFirst];
  const different = r() > 0.45;
  if (different) {
    const i = Math.floor(r() * sameSecond.length);
    sameSecond[i] = pick(white.filter((note) => note !== sameSecond[i]));
  }
  const singRoot = pick(['C', 'D', 'E', 'F', 'G'] as NoteName[]);
  return {
    different: { first, second, answerIndex },
    sing: { notes: [singRoot, order[(order.indexOf(singRoot) + 7) % order.length]] },
    rhythm: { bpm: 72 + Math.floor(r() * 28) },
    piano: { sequence: [pick(white), pick(white), pick(white)] },
    direction: { notes: [root, directionSecond], answer: directionUp ? 'ascendente' : 'descendente' },
    same: { first: sameFirst, second: sameSecond, answer: different ? 'diferente' : 'igual' },
  };
}

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function midi(note: NoteName, octave = 4) { return noteNameToMidi(`${note}${octave}`) ?? 60; }
function y(note: NoteName | null) { return note ? 7 + staff.indexOf(note) * 7.6 : 50; }
function detectedNote(freq: number): NoteName | null {
  if (!Number.isFinite(freq) || freq < 70) return null;
  const m = Math.round(69 + 12 * Math.log2(freq / 440));
  return order[((m % 12) + 12) % 12];
}
function pitch(buffer: Float32Array, sampleRate: number) {
  const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
  if (rms < 0.015) return null;
  let best = 0;
  let offset = -1;
  for (let o = 40; o < 1000; o += 1) {
    let score = 0;
    for (let i = 0; i < buffer.length - o; i += 1) score += 1 - Math.abs(buffer[i] - buffer[i + o]);
    score /= buffer.length - o;
    if (score > best) { best = score; offset = o; }
  }
  return best > 0.88 && offset > 0 ? sampleRate / offset : null;
}

export function DailyEarTrainingPlayerV2({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const ctxRef = useRef<AudioContext | null>(null);
  const started = useRef(Date.now());
  const challenge = useMemo(() => dailyChallenge(step.exerciseNumber), [step.exerciseNumber]);
  const [screen, setScreen] = useState(0);
  const [status, setStatus] = useState<Record<Key, Status>>({ different: 'idle', sing: 'idle', rhythm: 'idle', piano: 'idle', direction: 'idle', same: 'idle' });
  const [selected, setSelected] = useState<string[]>([]);
  const [voice, setVoice] = useState<{ target: number; detected: NoteName | null; active: boolean; done: boolean[] }>({ target: 0, detected: null, active: false, done: [] });
  const [message, setMessage] = useState('');
  const key = keys[screen];

  function getCtx() {
    if (!ctxRef.current) {
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      ctxRef.current = Ctor ? new Ctor() : null;
    }
    return ctxRef.current;
  }

  async function play(note: NoteName, duration = 560) {
    const ctx = getCtx();
    if (!ctx) return;
    await ctx.resume().catch(() => null);
    const m = midi(note);
    void preloadPianoSamples(ctx, [m]);
    await playPianoSample(ctx, m, ctx.currentTime + 0.025, ctx.currentTime + duration / 1000, 1.05);
    await sleep(duration + 80);
  }

  async function playMany(notes: NoteName[]) {
    const ctx = getCtx();
    if (ctx) void preloadPianoSamples(ctx, notes.map((note) => midi(note)));
    for (const note of notes) await play(note);
  }

  function next(result: Status) {
    setStatus((old) => ({ ...old, [key]: result }));
    setMessage(result === 'right' ? '✓' : '×');
    window.setTimeout(() => {
      setMessage('');
      setSelected([]);
      setVoice({ target: 0, detected: null, active: false, done: [] });
      setScreen((old) => old + 1);
    }, 720);
  }

  function quit() {
    stopPianoSamples(ctxRef.current ?? undefined);
    router.push('/aluno/central/diarios');
  }

  function finish() {
    completeDailyStep(step, Math.max(1, Math.round((Date.now() - started.current) / 1000)));
    stopPianoSamples(ctxRef.current ?? undefined);
    router.push('/aluno/central/diarios');
  }

  async function captureNote(note: NoteName, index: number) {
    setVoice((old) => ({ ...old, target: index, detected: null, active: true }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      let good = 0;
      const start = performance.now();
      while (performance.now() - start < 2300) {
        analyser.getFloatTimeDomainData(buffer);
        const heard = detectedNote(pitch(buffer, ctx.sampleRate) || 0);
        setVoice((old) => ({ ...old, detected: heard, active: true }));
        good = heard === note ? good + 1 : Math.max(0, good - 1);
        if (good >= 5) break;
        await sleep(90);
      }
      stream.getTracks().forEach((track) => track.stop());
      await ctx.close().catch(() => null);
      const ok = good >= 5;
      setVoice((old) => {
        const done = [...old.done];
        done[index] = ok;
        return { ...old, detected: ok ? note : old.detected, active: false, done };
      });
      return ok;
    } catch {
      setVoice((old) => ({ ...old, active: false }));
      return false;
    }
  }

  async function runSing() {
    if (voice.active) return;
    const results: boolean[] = [];
    for (let index = 0; index < challenge.sing.notes.length; index += 1) {
      const note = challenge.sing.notes[index];
      setVoice((old) => ({ ...old, target: index, detected: null, active: false }));
      await play(note);
      const ok = await captureNote(note, index);
      results[index] = ok;
      await sleep(320);
    }
    next(results.every(Boolean) ? 'right' : 'wrong');
  }

  if (screen >= keys.length) {
    const count = Object.values(status).filter((item) => item === 'right').length;
    return <section className="ear-ref result"><Style /><ResultBar status={status} /><h1>NÍVEL — {count >= 5 ? 'Intermediário' : 'Iniciante'}</h1><p>Acredite que você pode e você já está no meio do caminho.</p><small>- Theodore Roosevelt</small><button onClick={finish}>Continuar ›</button></section>;
  }

  return <section className="ear-ref"><Style /><Header level={exercise.level} status={status} current={screen} quit={quit} />{message ? <div className={`feedback ${message === '×' ? 'bad' : ''}`}>{message}</div> : null}{key === 'different' && <Different challenge={challenge} playMany={playMany} selected={selected} setSelected={setSelected} next={next} />}{key === 'sing' && <Sing challenge={challenge} runSing={runSing} voice={voice} />}{key === 'rhythm' && <Simple title="Observe a bateria" subtitle="toque seguindo o ritmo" play={() => next('right')} />}{key === 'piano' && <Piano challenge={challenge} play={play} playMany={playMany} selected={selected} setSelected={setSelected} next={next} />}{key === 'direction' && <Choice title="Ouça as duas notas" subtitle="Elas estão ascendentes ou descendentes?" play={() => playMany(challenge.direction.notes)} options={['ascendente', 'descendente']} answer={challenge.direction.answer} next={next} />}{key === 'same' && <Choice title="Ouça dois conjuntos de notas." subtitle="São iguais ou diferentes?" play={async () => { await playMany(challenge.same.first); await sleep(350); await playMany(challenge.same.second); }} options={['igual', 'diferente']} answer={challenge.same.answer} next={next} />}</section>;
}

function Header({ level, status, current, quit }: { level: string; status: Record<Key, Status>; current: number; quit: () => void }) {
  return <><div className="top"><button onClick={quit}>Quit</button><span>{level}</span><i>i</i></div><div className="icons">{keys.map((key, index) => <span key={key} className={`${index === current ? 'active' : ''} ${status[key]}`}>{icons[index]}<b>{status[key] === 'right' ? '✓' : status[key] === 'wrong' ? '×' : ''}</b></span>)}</div><div className="rule" /></>;
}
function ResultBar({ status }: { status: Record<Key, Status> }) { return <div className="icons result-icons">{keys.map((key, index) => <span key={key} className={status[key]}>{icons[index]}<b>{status[key] === 'right' ? '✓' : '×'}</b></span>)}</div>; }

function Different({ challenge, playMany, selected, setSelected, next }: { challenge: Challenge; playMany: (notes: NoteName[]) => Promise<void>; selected: string[]; setSelected: (value: string[]) => void; next: (status: Status) => void }) {
  return <main className="different"><h2>Ouça dois conjuntos de notas.</h2><p>Do 2º conjunto, selecione a nota que está fora do 1º conjunto</p><div className="different-grid"><div className="sound-stack"><div><strong>1st</strong><button onClick={() => playMany(challenge.different.first)}>🔊</button></div><div><strong>2nd</strong><button onClick={() => playMany(challenge.different.second)}>🔊</button></div></div><div className="note-grid">{challenge.different.first.map((note, index) => <div className="note-ref" key={`a-${note}-${index}`}><span>♪</span><b>{note}</b></div>)}{challenge.different.second.map((note, index) => <button key={`b-${note}-${index}`} className={selected[0] === String(index) ? 'picked' : ''} onClick={() => setSelected([String(index)])}><span>♪</span><i /></button>)}</div></div>{selected.length ? <button className="send" onClick={() => next(Number(selected[0]) === challenge.different.answerIndex ? 'right' : 'wrong')}>Enviar</button> : null}</main>;
}

function Sing({ challenge, runSing, voice }: { challenge: Challenge; runSing: () => Promise<void>; voice: { target: number; detected: NoteName | null; active: boolean; done: boolean[] } }) {
  return <main className="sing"><h2>Ouça e cante as mesmas notas</h2><div className="staff">{staff.map((note) => <div key={note}><span>{note}</span><i /></div>)}{challenge.sing.notes.map((note, index) => <button key={`${note}-${index}`} className={`target ${voice.target === index ? 'current' : ''} ${voice.done[index] ? 'done' : ''}`} style={{ top: `${y(note)}%`, left: `${index ? 75 : 32}%` }}>{voice.done[index] ? '✓' : note}</button>)}{voice.detected ? <em className="voice" style={{ top: `${y(voice.detected)}%`, left: `${voice.target ? 75 : 32}%` }} /> : null}</div><button className="big-sound" onClick={runSing}>🔊</button><small>{voice.active ? 'centralize a bolinha' : 'toque e cante'}</small></main>;
}

function Piano({ challenge, play, playMany, selected, setSelected, next }: { challenge: Challenge; play: (note: NoteName) => Promise<void>; playMany: (notes: NoteName[]) => Promise<void>; selected: string[]; setSelected: (value: string[]) => void; next: (status: Status) => void }) {
  return <main className="piano"><h2>Ouça a sequência</h2><p>toque na ordem</p><div className="keys">{white.map((note) => <button key={note} onClick={async () => { await play(note); if (selected.length < 3) setSelected([...selected, note]); }}>{note}</button>)}</div><div className="slots">{[0, 1, 2].map((i) => <span key={i}>{selected[i]}</span>)}</div><button className="big-sound" onClick={() => playMany(challenge.piano.sequence)}>🔊</button>{selected.length === 3 ? <button className="send" onClick={() => next(selected.join(',') === challenge.piano.sequence.join(',') ? 'right' : 'wrong')}>Enviar</button> : null}</main>;
}
function Choice({ title, subtitle, play, options, answer, next }: { title: string; subtitle: string; play: () => Promise<void>; options: string[]; answer: string; next: (status: Status) => void }) {
  const [choice, setChoice] = useState('');
  return <main className="choice"><h2>{title}</h2><p>{subtitle}</p><div className="choice-notes"><span>1st ♪</span><span>2nd ♪</span></div><button className="big-sound" onClick={play}>🔊</button><small>selecionar resposta</small><div>{options.map((option) => <button key={option} className={choice === option ? 'picked' : ''} onClick={() => setChoice(option)}>{option.toUpperCase()}</button>)}</div>{choice ? <button className="send" onClick={() => next(choice === answer ? 'right' : 'wrong')}>Enviar</button> : null}</main>;
}
function Simple({ title, subtitle, play }: { title: string; subtitle: string; play: () => void }) { return <main className="choice"><h2>{title}</h2><p>{subtitle}</p><button className="big-sound" onClick={play}>🔊</button></main>; }

function Style() { return <style>{css}</style>; }
const css = `.ear-ref{min-height:100dvh;position:relative;overflow:hidden;padding:calc(118px + env(safe-area-inset-top)) 32px calc(30px + env(safe-area-inset-bottom));background:radial-gradient(circle at 50% 0%,rgba(255,255,255,.13),transparent 22%),radial-gradient(circle at 82% 50%,rgba(255,255,255,.05),transparent 18%),radial-gradient(circle at 20% 76%,rgba(255,255,255,.04),transparent 22%),linear-gradient(180deg,#1d1d1d,#101010 48%,#080808);color:#fff;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace}.ear-ref:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 16%),repeating-linear-gradient(112deg,rgba(255,255,255,.018) 0 1px,transparent 1px 21px);opacity:.42;pointer-events:none}.ear-ref>*{position:relative;z-index:1}.top{position:absolute;top:calc(30px + env(safe-area-inset-top));left:32px;right:32px;display:grid;grid-template-columns:112px 1fr 58px;align-items:center}.top button{width:112px;height:54px;border:2px solid rgba(255,255,255,.82);border-radius:999px;background:rgba(255,255,255,.02);color:#fff;font:900 20px system-ui,sans-serif}.top span{font-size:20px;letter-spacing:.09em;color:rgba(255,255,255,.58)}.top i{width:54px;height:54px;border:2px solid rgba(255,255,255,.82);border-radius:50%;display:grid;place-items:center;font:900 28px system-ui,sans-serif;font-style:normal}.icons{display:grid;grid-template-columns:repeat(6,1fr);gap:20px;height:54px;align-items:end;margin:0 0 12px}.icons span{position:relative;display:grid;place-items:center;min-height:52px;font-size:39px;color:rgba(255,255,255,.46);filter:grayscale(1)}.icons span.active{color:#fff;text-shadow:0 0 18px rgba(255,255,255,.9);filter:none}.icons span.active:after{content:'';position:absolute;left:50%;bottom:-18px;transform:translateX(-50%);border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:10px solid rgba(255,255,255,.95)}.icons b{position:absolute;right:2px;bottom:-20px;font-size:30px;color:#00dc64;text-shadow:none}.icons .wrong b{color:#ff1c1c}.rule{height:1px;background:rgba(255,255,255,.46);margin-bottom:78px}h2{font-size:clamp(24px,6.4vw,34px);line-height:1.08;margin:0 auto 10px;font-weight:900;letter-spacing:.015em;max-width:710px;color:rgba(255,255,255,.94)}p{font-size:clamp(18px,4.6vw,27px);line-height:1.18;margin:0 auto 72px;color:rgba(255,255,255,.72);font-weight:700;max-width:720px}.different-grid{display:grid;grid-template-columns:84px 1fr;gap:38px;align-items:start}.sound-stack{display:grid;gap:68px;justify-items:center}.sound-stack strong{display:block;width:66px;text-align:left;font-size:25px;line-height:1;margin-bottom:9px}.sound-stack button{width:66px;height:66px;border:2px solid rgba(255,255,255,.96);border-radius:50%;background:rgba(0,0,0,.06);font-size:0}.sound-stack button:before,.big-sound:before{content:'🔊';font-size:29px}.note-grid{display:grid;grid-template-columns:repeat(2,minmax(84px,1fr));grid-template-rows:92px 92px;column-gap:48px;row-gap:46px;align-items:center;padding-top:22px}.note-ref,.note-grid button{display:grid;place-items:center;border:0;background:transparent;color:rgba(255,255,255,.74);min-height:92px}.note-ref span,.note-grid button span{font-size:54px;line-height:.72}.note-ref b{font-size:24px;line-height:1;margin-top:7px;color:rgba(255,255,255,.82)}.note-grid i{width:34px;height:34px;border:2px solid rgba(255,255,255,.72);border-radius:50%;margin-top:10px}.picked i,.note-grid .picked i{background:rgba(255,255,255,.84);box-shadow:0 0 18px rgba(255,255,255,.5)}.send{position:absolute;right:32px;bottom:calc(32px + env(safe-area-inset-bottom));border:0;background:transparent;color:#fff;font:900 30px ui-monospace,SFMono-Regular,monospace;text-shadow:0 0 18px #fff}.sing h2{font-size:clamp(22px,5.8vw,31px);margin-bottom:54px}.staff{position:relative;height:56dvh;min-height:430px;margin:0 auto 20px}.staff div{display:grid;grid-template-columns:48px 1fr;align-items:center;height:8.33%;color:rgba(255,255,255,.56);font:900 22px system-ui,sans-serif}.staff i{height:1px;background:rgba(255,255,255,.44)}.target{position:absolute;width:82px;height:82px;border:5px solid rgba(255,255,255,.92);border-radius:50%;background:rgba(255,255,255,.04);color:#fff;font:900 24px system-ui,sans-serif;display:grid;place-items:center;transform:translate(-50%,-50%)}.target.done{border-color:#00dc64;color:#00dc64}.voice{position:absolute;width:52px;height:52px;border:4px solid #fff;border-radius:50%;background:#ff1717;box-shadow:0 0 22px rgba(255,0,0,.55);transform:translate(-50%,-50%);transition:top .1s ease;z-index:5}.big-sound{width:92px;height:92px;border:3px solid #fff;border-radius:50%;background:rgba(255,255,255,.04);font-size:0;box-shadow:0 0 24px rgba(255,255,255,.12)}small{display:block;margin-top:10px;color:rgba(255,255,255,.42);font-size:18px}.feedback{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:70px;color:#00dc64;text-shadow:0 0 22px #00dc64;z-index:6;font-weight:950}.feedback.bad{color:#ff1c1c;text-shadow:0 0 22px #ff1c1c}.keys{display:grid;grid-template-columns:repeat(7,1fr);height:210px;border:2px solid rgba(255,255,255,.5);border-radius:22px;padding:38px 18px 24px}.keys button{background:linear-gradient(#fff,#ddd);color:#111;border:1px solid #555;font-weight:900;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px}.slots{display:flex;justify-content:center;gap:24px;margin:30px 0}.slots span{width:64px;height:64px;border:3px solid #fff;border-radius:50%;display:grid;place-items:center}.choice-notes{height:210px;display:flex;align-items:center;justify-content:center;gap:110px;font-size:32px}.choice div:last-of-type{display:flex;justify-content:center;gap:20px}.choice div:last-of-type button{border:0;background:transparent;color:rgba(255,255,255,.65);font-size:clamp(25px,8vw,40px);font-weight:950}.choice .picked{color:#fff!important;text-shadow:0 0 18px #fff}.result{display:grid;align-content:center}.result-icons{margin-bottom:90px}.result h1{font-size:30px;margin-bottom:130px}.result p{font:800 24px system-ui,sans-serif;margin-bottom:24px}.result button{position:absolute;right:32px;bottom:calc(38px + env(safe-area-inset-bottom));border:0;background:transparent;color:#fff;font-size:38px;text-shadow:0 0 18px #fff}@media(max-width:520px){.ear-ref{padding-left:31px;padding-right:31px}.top{left:31px;right:31px}.rule{margin-bottom:74px}.different p{margin-bottom:72px}.sing .rule{margin-bottom:68px}.staff{height:52dvh}.target{width:72px;height:72px}.voice{width:48px;height:48px}}`;
}
