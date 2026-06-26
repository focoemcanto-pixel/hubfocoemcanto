'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Status = 'pending' | 'right' | 'wrong';
type Exercise = { id: number; type: 'different' | 'sing' | 'sequence' | 'choice' | 'simple'; icon: string; title: string; subtitle: string; answer?: string; notes?: string[]; options?: string[]; piano?: { root: string; sequence: string[] } };

const exercises: Exercise[] = [
  { id: 1, type: 'different', icon: '♬', title: 'Qual nota está diferente?', subtitle: 'Ouça cada nota e escolha a que não combina.', notes: ['C4', 'C4', 'D4', 'C4'], answer: 'D4' },
  { id: 2, type: 'sing', icon: '♪', title: 'Cante a nota exibida', subtitle: 'Mire a bolinha na nota indicada.', notes: ['E4'], answer: 'E4' },
  { id: 3, type: 'sequence', icon: '▦', title: 'Repita a sequência no piano', subtitle: 'Ouça e toque as três notas na mesma ordem.', piano: { root: 'C', sequence: ['C', 'E', 'G'] } },
  { id: 4, type: 'choice', icon: '♫', title: 'O intervalo subiu ou desceu?', subtitle: 'Escute as duas notas.', notes: ['G4', 'E4'], answer: 'desceu', options: ['subiu', 'desceu'] },
  { id: 5, type: 'simple', icon: '◎', title: 'Memorize a referência', subtitle: 'Ouça e tente guardar a sensação dessa nota.', notes: ['A4'] },
  { id: 6, type: 'choice', icon: '✓', title: 'A segunda nota é maior ou menor?', subtitle: 'Perceba a sensação do intervalo.', notes: ['C4', 'E4'], answer: 'maior', options: ['maior', 'menor'] },
];

const midi: Record<string, number> = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71 };
const white = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const noteOrder = ['B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3', 'A3', 'G3', 'F3', 'E3'];

function freq(note: string) {
  const n = midi[note] ?? midi[`${note}4`] ?? 60;
  return 440 * Math.pow(2, (n - 69) / 12);
}

export function DailyEarTrainingPlayerV2() {
  const [index, setIndex] = useState(0);
  const [statuses, setStatuses] = useState<Status[]>(Array(exercises.length).fill('pending'));
  const [feedback, setFeedback] = useState<Status | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const challenge = exercises[index];
  const done = index >= exercises.length;

  function audio() {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  }

  async function play(note: string, duration = .7) {
    const ctx = audio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq(note);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.28, ctx.currentTime + .025);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + .04);
    await new Promise((resolve) => setTimeout(resolve, duration * 1000));
  }

  async function playMany(notes: string[]) {
    for (const note of notes) await play(note, .55);
  }

  function next(status: Status) {
    const copy = [...statuses];
    copy[index] = status;
    setStatuses(copy);
    setFeedback(status);
    setTimeout(() => {
      setFeedback(null);
      setIndex((value) => value + 1);
    }, 650);
  }

  if (done) return <section className="ear-ref result"><Style /><Icons statuses={statuses} active={exercises.length - 1} /><h1>Resultado</h1><p>{statuses.filter((status) => status === 'right').length} respostas certas</p><button onClick={() => { setIndex(0); setStatuses(Array(exercises.length).fill('pending')); }}>refazer</button></section>;

  return (
    <section className={`ear-ref ${challenge.type}`}>
      <Style />
      <header className="top"><button>done</button><span>Teoria Musical</span><i>?</i></header>
      <Icons statuses={statuses} active={index} />
      <div className="rule" />
      {challenge.type === 'different' ? <Different challenge={challenge} play={play} next={next} /> : null}
      {challenge.type === 'sing' ? <Sing challenge={challenge} play={play} next={next} /> : null}
      {challenge.type === 'sequence' && challenge.piano ? <Sequence challenge={challenge} play={play} playMany={playMany} next={next} /> : null}
      {challenge.type === 'choice' ? <Choice title={challenge.title} subtitle={challenge.subtitle} play={() => playMany(challenge.notes || [])} options={challenge.options || []} answer={challenge.answer || ''} next={next} /> : null}
      {challenge.type === 'simple' ? <Simple title={challenge.title} subtitle={challenge.subtitle} play={() => playMany(challenge.notes || [])} /> : null}
      {feedback ? <div className={`feedback ${feedback === 'wrong' ? 'bad' : ''}`}>{feedback === 'right' ? '✓' : '×'}</div> : null}
    </section>
  );
}

function Icons({ statuses, active }: { statuses: Status[]; active: number }) {
  return <div className="icons">{exercises.map((exercise, i) => <span key={exercise.id} className={`${i === active ? 'active' : ''} ${statuses[i] === 'wrong' ? 'wrong' : ''}`}>{exercise.icon}{statuses[i] !== 'pending' ? <b>{statuses[i] === 'right' ? '✓' : '×'}</b> : null}</span>)}</div>;
}

function Different({ challenge, play, next }: { challenge: Exercise; play: (note: string) => Promise<void>; next: (status: Status) => void }) {
  const [picked, setPicked] = useState('');
  return <main><h2>{challenge.title}</h2><p>{challenge.subtitle}</p><div className="different-grid"><div className="sound-stack">{(challenge.notes || []).map((note, i) => <div key={`${note}-${i}`}><strong>{i + 1}st</strong><button onClick={() => play(note)} /></div>)}</div><div className="note-grid">{(challenge.notes || []).map((note, i) => <button key={`${note}-pick-${i}`} onClick={() => setPicked(note)} className={picked === note ? 'picked' : ''}><span>♪</span><b>{i + 1}</b><i /></button>)}</div></div>{picked ? <button className="send" onClick={() => next(picked === challenge.answer ? 'right' : 'wrong')}>Enviar</button> : null}</main>;
}

function Sing({ challenge, play, next }: { challenge: Exercise; play: (note: string) => Promise<void>; next: (status: Status) => void }) {
  const target = challenge.answer || 'E4';
  const lines = useMemo(() => noteOrder, []);
  const top = 100 * (lines.indexOf(target) / Math.max(1, lines.length - 1));
  return <main><h2>{challenge.title}</h2><div className="staff">{lines.map((line) => <div key={line}><span>{line}</span><i /></div>)}<button className="target" style={{ top: `${top}%`, left: '62%' }} onClick={async () => { await play(target); next('right'); }}>{target}</button><span className="voice" style={{ top: `${top + 7}%`, left: '42%' }} /></div><button className="big-sound" onClick={() => play(target)} /></main>;
}

function Sequence({ challenge, play, playMany, next }: { challenge: Exercise; play: (note: string) => Promise<void>; playMany: (notes: string[]) => Promise<void>; next: (status: Status) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <main className="piano"><h2>Ouça a sequência</h2><p>toque na ordem</p><div className="keys">{white.map((note) => <button key={note} onClick={async () => { await play(note); if (selected.length < 3) setSelected([...selected, note]); }}>{note}</button>)}</div><div className="slots">{[0, 1, 2].map((i) => <span key={i}>{selected[i]}</span>)}</div><button className="big-sound" onClick={() => playMany(challenge.piano.sequence)}>🔊</button>{selected.length === 3 ? <button className="send" onClick={() => next(selected.join(',') === challenge.piano.sequence.join(',') ? 'right' : 'wrong')}>Enviar</button> : null}</main>;
}

function Choice({ title, subtitle, play, options, answer, next }: { title: string; subtitle: string; play: () => Promise<void>; options: string[]; answer: string; next: (status: Status) => void }) {
  const [choice, setChoice] = useState('');
  return <main className="choice"><h2>{title}</h2><p>{subtitle}</p><div className="choice-notes"><span>1st ♪</span><span>2nd ♪</span></div><button className="big-sound" onClick={play}>🔊</button><small>selecionar resposta</small><div>{options.map((option) => <button key={option} className={choice === option ? 'picked' : ''} onClick={() => setChoice(option)}>{option.toUpperCase()}</button>)}</div>{choice ? <button className="send" onClick={() => next(choice === answer ? 'right' : 'wrong')}>Enviar</button> : null}</main>;
}

function Simple({ title, subtitle, play }: { title: string; subtitle: string; play: () => void }) { return <main className="choice"><h2>{title}</h2><p>{subtitle}</p><button className="big-sound" onClick={play}>🔊</button></main>; }

function Style() { return <style>{css}</style>; }
const css = `.ear-ref{min-height:100dvh;position:relative;overflow:hidden;padding:calc(118px + env(safe-area-inset-top)) 32px calc(30px + env(safe-area-inset-bottom));background:radial-gradient(circle at 50% 0%,rgba(255,255,255,.13),transparent 22%),radial-gradient(circle at 82% 50%,rgba(255,255,255,.05),transparent 18%),radial-gradient(circle at 20% 76%,rgba(255,255,255,.04),transparent 22%),linear-gradient(180deg,#1d1d1d,#101010 48%,#080808);color:#fff;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace}.ear-ref:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 16%),repeating-linear-gradient(112deg,rgba(255,255,255,.018) 0 1px,transparent 1px 21px);opacity:.42;pointer-events:none}.ear-ref>*{position:relative;z-index:1}.top{position:absolute;top:calc(30px + env(safe-area-inset-top));left:32px;right:32px;display:grid;grid-template-columns:112px 1fr 58px;align-items:center}.top button{width:112px;height:54px;border:2px solid rgba(255,255,255,.82);border-radius:999px;background:rgba(255,255,255,.02);color:#fff;font:900 20px system-ui,sans-serif}.top span{font-size:20px;letter-spacing:.09em;color:rgba(255,255,255,.58)}.top i{width:54px;height:54px;border:2px solid rgba(255,255,255,.82);border-radius:50%;display:grid;place-items:center;font:900 28px system-ui,sans-serif;font-style:normal}.icons{display:grid;grid-template-columns:repeat(6,1fr);gap:20px;height:54px;align-items:end;margin:0 0 12px}.icons span{position:relative;display:grid;place-items:center;min-height:52px;font-size:39px;color:rgba(255,255,255,.46);filter:grayscale(1)}.icons span.active{color:#fff;text-shadow:0 0 18px rgba(255,255,255,.9);filter:none}.icons span.active:after{content:'';position:absolute;left:50%;bottom:-18px;transform:translateX(-50%);border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:10px solid rgba(255,255,255,.95)}.icons b{position:absolute;right:2px;bottom:-20px;font-size:30px;color:#00dc64;text-shadow:none}.icons .wrong b{color:#ff1c1c}.rule{height:1px;background:rgba(255,255,255,.46);margin-bottom:78px}h2{font-size:clamp(24px,6.4vw,34px);line-height:1.08;margin:0 auto 10px;font-weight:900;letter-spacing:.015em;max-width:710px;color:rgba(255,255,255,.94)}p{font-size:clamp(18px,4.6vw,27px);line-height:1.18;margin:0 auto 72px;color:rgba(255,255,255,.72);font-weight:700;max-width:720px}.different-grid{display:grid;grid-template-columns:84px 1fr;gap:38px;align-items:start}.sound-stack{display:grid;gap:68px;justify-items:center}.sound-stack strong{display:block;width:66px;text-align:left;font-size:25px;line-height:1;margin-bottom:9px}.sound-stack button{width:66px;height:66px;border:2px solid rgba(255,255,255,.96);border-radius:50%;background:rgba(0,0,0,.06);font-size:0}.sound-stack button:before,.big-sound:before{content:'🔊';font-size:29px}.note-grid{display:grid;grid-template-columns:repeat(2,minmax(84px,1fr));grid-template-rows:92px 92px;column-gap:48px;row-gap:46px;align-items:center;padding-top:22px}.note-ref,.note-grid button{display:grid;place-items:center;border:0;background:transparent;color:rgba(255,255,255,.74);min-height:92px}.note-ref span,.note-grid button span{font-size:54px;line-height:.72}.note-ref b{font-size:24px;line-height:1;margin-top:7px;color:rgba(255,255,255,.82)}.note-grid i{width:34px;height:34px;border:2px solid rgba(255,255,255,.72);border-radius:50%;margin-top:10px}.picked i,.note-grid .picked i{background:rgba(255,255,255,.84);box-shadow:0 0 18px rgba(255,255,255,.5)}.send{position:absolute;right:32px;bottom:calc(32px + env(safe-area-inset-bottom));border:0;background:transparent;color:#fff;font:900 30px ui-monospace,SFMono-Regular,monospace;text-shadow:0 0 18px #fff}.sing h2{font-size:clamp(22px,5.8vw,31px);margin-bottom:54px}.staff{position:relative;height:56dvh;min-height:430px;margin:0 auto 20px}.staff div{display:grid;grid-template-columns:48px 1fr;align-items:center;height:8.33%;color:rgba(255,255,255,.56);font:900 22px system-ui,sans-serif}.staff i{height:1px;background:rgba(255,255,255,.44)}.target{position:absolute;width:82px;height:82px;border:5px solid rgba(255,255,255,.92);border-radius:50%;background:rgba(255,255,255,.04);color:#fff;font:900 24px system-ui,sans-serif;display:grid;place-items:center;transform:translate(-50%,-50%)}.target.done{border-color:#00dc64;color:#00dc64}.voice{position:absolute;width:52px;height:52px;border:4px solid #fff;border-radius:50%;background:#ff1717;box-shadow:0 0 22px rgba(255,0,0,.55);transform:translate(-50%,-50%);transition:top .1s ease;z-index:5}.big-sound{width:92px;height:92px;border:3px solid #fff;border-radius:50%;background:rgba(255,255,255,.04);font-size:0;box-shadow:0 0 24px rgba(255,255,255,.12)}small{display:block;margin-top:10px;color:rgba(255,255,255,.42);font-size:18px}.feedback{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:70px;color:#00dc64;text-shadow:0 0 22px #00dc64;z-index:6;font-weight:950}.feedback.bad{color:#ff1c1c;text-shadow:0 0 22px #ff1c1c}.keys{display:grid;grid-template-columns:repeat(7,1fr);height:210px;border:2px solid rgba(255,255,255,.5);border-radius:22px;padding:38px 18px 24px}.keys button{background:linear-gradient(#fff,#ddd);color:#111;border:1px solid #555;font-weight:900;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px}.slots{display:flex;justify-content:center;gap:24px;margin:30px 0}.slots span{width:64px;height:64px;border:3px solid #fff;border-radius:50%;display:grid;place-items:center}.choice-notes{height:210px;display:flex;align-items:center;justify-content:center;gap:110px;font-size:32px}.choice div:last-of-type{display:flex;justify-content:center;gap:20px}.choice div:last-of-type button{border:0;background:transparent;color:rgba(255,255,255,.65);font-size:clamp(25px,8vw,40px);font-weight:950}.choice .picked{color:#fff!important;text-shadow:0 0 18px #fff}.result{display:grid;align-content:center}.result-icons{margin-bottom:90px}.result h1{font-size:30px;margin-bottom:130px}.result p{font:800 24px system-ui,sans-serif;margin-bottom:24px}.result button{position:absolute;right:32px;bottom:calc(38px + env(safe-area-inset-bottom));border:0;background:transparent;color:#fff;font-size:38px;text-shadow:0 0 18px #fff}@media(max-width:520px){.ear-ref{padding-left:31px;padding-right:31px}.top{left:31px;right:31px}.rule{margin-bottom:74px}.different p{margin-bottom:72px}.sing .rule{margin-bottom:68px}.staff{height:52dvh}.target{width:72px;height:72px}.voice{width:48px;height:48px}}`;
