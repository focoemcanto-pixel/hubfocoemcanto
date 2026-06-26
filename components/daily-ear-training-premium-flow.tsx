'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type Note = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
type Screen = 0 | 1 | 2 | 3;
type Score = { perfect: number; great: number; good: number; missed: number };

type FlowData = {
  first: Note[];
  second: Note[];
  answer: number;
  sing: Note[];
  interval: Note[];
  intervalAnswer: 'subiu' | 'desceu';
};

const notePool: Note[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const icons = ['♪', '▥', '◉', '▰'];
const staff = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
const order: Note[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function seeded(seedValue: number) {
  let s = seedValue || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function midi(note: Note, octave = 4) { return noteNameToMidi(`${note}${octave}`) ?? 60; }
function y(note: string | null) { const i = note ? staff.indexOf(note) : -1; return i >= 0 ? 7 + i * 7.6 : 50; }
function detected(freq: number) {
  if (!Number.isFinite(freq) || freq < 70) return null;
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const m = Math.round(69 + 12 * Math.log2(freq / 440));
  return names[((m % 12) + 12) % 12];
}
function pitch(buffer: Float32Array, sampleRate: number) {
  const rms = Math.sqrt(buffer.reduce((a, b) => a + b * b, 0) / buffer.length);
  if (rms < 0.015) return null;
  let best = 0;
  let off = -1;
  for (let o = 40; o < 1000; o += 1) {
    let score = 0;
    for (let i = 0; i < buffer.length - o; i += 1) score += 1 - Math.abs(buffer[i] - buffer[i + o]);
    score /= buffer.length - o;
    if (score > best) { best = score; off = o; }
  }
  return best > 0.88 && off > 0 ? sampleRate / off : null;
}

function build(step: number): FlowData {
  const now = new Date();
  const r = seeded(Number(`${now.getFullYear()}${now.getMonth()+1}${now.getDate()}${step}`));
  const pick = <T,>(items: T[]) => items[Math.floor(r() * items.length) % items.length];
  const first: Note[] = [pick(['B','C','D','E','F','G'] as Note[]), pick(['C','D','E','F','G','A'] as Note[])];
  const answer = Math.floor(r() * 2);
  const second: Note[] = [...first];
  second[answer] = pick(notePool.filter((n) => n !== first[answer]));
  const sing: Note[] = [pick(['C','D','E','F','G'] as Note[]), pick(['C','D','E','F','G','A'] as Note[])];
  const low = pick(['C', 'D', 'E', 'F'] as Note[]);
  const high = pick(['G', 'A', 'B'] as Note[]);
  const intervalAnswer = r() > .5 ? 'subiu' : 'desceu';
  const interval = intervalAnswer === 'subiu' ? [low, high] : [high, low];
  return { first, second, answer, sing, interval, intervalAnswer };
}

export function DailyEarTrainingPremiumFlow({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const audioRef = useRef<AudioContext | null>(null);
  const started = useRef(Date.now());
  const data = useMemo(() => build(step.exerciseNumber), [step.exerciseNumber]);
  const [screen, setScreen] = useState<Screen>(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [choice, setChoice] = useState<'subiu' | 'desceu' | null>(null);
  const [result, setResult] = useState<'idle' | 'right' | 'wrong'>('idle');
  const [playing, setPlaying] = useState<'first' | 'second' | 'interval' | null>(null);
  const [voice, setVoice] = useState<{ target: number; heard: string | null; active: boolean; done: boolean[] }>({ target: 0, heard: null, active: false, done: [] });
  const [phase, setPhase] = useState<'ready' | 'demo' | 'play' | 'done'>('ready');
  const [beat, setBeat] = useState(-1);
  const [taps, setTaps] = useState(0);
  const [quality, setQuality] = useState<string | null>(null);
  const [score, setScore] = useState<Score>({ perfect: 0, great: 0, good: 0, missed: 0 });
  const rhythmStart = useRef(0);
  const bpm = 77;
  const beatMs = Math.round(60000 / bpm);

  function ctx() { if (!audioRef.current) audioRef.current = new AudioContext(); return audioRef.current; }
  async function piano(note: Note) {
    const c = ctx();
    await c.resume().catch(() => null);
    const m = midi(note);
    void preloadPianoSamples(c, [m]);
    await playPianoSample(c, m, c.currentTime + .025, c.currentTime + .58, 1.04);
    await wait(610);
  }
  async function playSet(kind: 'first' | 'second') {
    if (playing) return;
    setPlaying(kind);
    const target = kind === 'first' ? data.first : data.second;
    const c = ctx();
    void preloadPianoSamples(c, target.map((n) => midi(n)));
    for (const note of target) await piano(note);
    setPlaying(null);
  }
  async function playInterval() {
    if (playing) return;
    setPlaying('interval');
    const c = ctx();
    void preloadPianoSamples(c, data.interval.map((n) => midi(n)));
    for (const note of data.interval) await piano(note);
    setPlaying(null);
  }
  async function kick() {
    const c = ctx();
    await c.resume().catch(() => null);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(122, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(48, c.currentTime + .16);
    g.gain.setValueAtTime(.42, c.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .22);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + .23);
  }
  function quit() { stopPianoSamples(audioRef.current ?? undefined); router.push('/aluno/central/diarios'); }
  function done() {
    completeDailyStep(step, Math.max(1, Math.round((Date.now() - started.current) / 1000)));
    stopPianoSamples(audioRef.current ?? undefined);
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }
  function submitNote() {
    if (selected == null) return;
    setResult(selected === data.answer ? 'right' : 'wrong');
    window.setTimeout(() => { setResult('idle'); setScreen(1); }, 650);
  }
  function submitInterval() {
    if (!choice) return;
    setResult(choice === data.intervalAnswer ? 'right' : 'wrong');
    window.setTimeout(done, 800);
  }

  async function listen(target: Note, index: number) {
    setVoice((old) => ({ ...old, target: index, heard: null, active: true }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const c = new AudioContext();
      const source = c.createMediaStreamSource(stream);
      const analyser = c.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      let ok = 0;
      const start = performance.now();
      while (performance.now() - start < 2300) {
        analyser.getFloatTimeDomainData(buffer);
        const heard = detected(pitch(buffer, c.sampleRate) || 0);
        setVoice((old) => ({ ...old, heard, active: true }));
        ok = heard === target ? ok + 1 : Math.max(0, ok - 1);
        if (ok >= 5) break;
        await wait(90);
      }
      stream.getTracks().forEach((track) => track.stop());
      await c.close().catch(() => null);
      const good = ok >= 5;
      setVoice((old) => { const doneNotes = [...old.done]; doneNotes[index] = good; return { ...old, heard: good ? target : old.heard, active: false, done: doneNotes }; });
      return good;
    } catch {
      setVoice((old) => ({ ...old, active: false }));
      return false;
    }
  }
  async function runSing() {
    if (voice.active) return;
    setVoice({ target: 0, heard: null, active: false, done: [] });
    for (const note of data.sing) await piano(note);
    await wait(260);
    const out: boolean[] = [];
    for (let i = 0; i < data.sing.length; i += 1) {
      out[i] = await listen(data.sing[i], i);
      await wait(220);
    }
    setResult(out.every(Boolean) ? 'right' : 'wrong');
    window.setTimeout(() => { setResult('idle'); setScreen(2); }, 650);
  }
  async function demo() {
    if (phase !== 'ready') return;
    setPhase('demo'); setScore({ perfect: 0, great: 0, good: 0, missed: 0 }); setTaps(0); setQuality(null);
    for (let i = 0; i < 4; i += 1) { setBeat(i); await kick(); await wait(beatMs); }
    setBeat(-1); await wait(300); setPhase('play'); rhythmStart.current = performance.now() + 480;
    for (let i = 0; i < 4; i += 1) window.setTimeout(() => setBeat(i), 480 + i * beatMs);
    window.setTimeout(() => setBeat(-1), 480 + 4 * beatMs);
  }
  function tap() {
    if (phase !== 'play' || taps >= 4) return;
    void kick();
    const diff = Math.abs(performance.now() - (rhythmStart.current + taps * beatMs));
    const q = diff <= 85 ? 'perfect' : diff <= 150 ? 'great' : diff <= 240 ? 'good' : 'missed';
    setQuality(q);
    setScore((old) => ({ ...old, [q]: old[q as keyof Score] + 1 }));
    const next = taps + 1;
    setTaps(next);
    if (next >= 4) { setPhase('done'); window.setTimeout(() => setScreen(3), 900); }
  }

  return <main className="premium-flow"><style>{css}</style><Header level={exercise.level} screen={screen} quit={quit} />{screen === 0 && <NoteScreen data={data} playing={playing} selected={selected} setSelected={setSelected} playSet={playSet} submit={submitNote} result={result} />}{screen === 1 && <SingScreen data={data} voice={voice} run={runSing} result={result} />}{screen === 2 && <RhythmScreen bpm={bpm} beat={beat} phase={phase} score={score} quality={quality} demo={demo} tap={tap} />}{screen === 3 && <IntervalScreen choice={choice} setChoice={setChoice} play={playInterval} playing={playing === 'interval'} submit={submitInterval} result={result} />}</main>;
}

function Header({ level, screen, quit }: { level: string; screen: Screen; quit: () => void }) { return <><header className="pf-top"><button onClick={quit}>Sair</button><span>{level}</span><i>i</i></header><nav className="pf-icons">{icons.map((icon, i) => <span key={icon} className={`${i === screen ? 'active' : ''} ${i < screen ? 'done' : ''}`}>{icon}<b>✓</b></span>)}</nav></>; }
function Medal() { return <div className="pf-medal"><b>♛</b><span>◇</span></div>; }
function NoteScreen({ data, playing, selected, setSelected, playSet, submit, result }: { data: FlowData; playing: string | null; selected: number | null; setSelected: (n: number) => void; playSet: (k: 'first' | 'second') => void; submit: () => void; result: 'idle' | 'right' | 'wrong' }) { return <section className="pf-note-stage"><section className="pf-card"><Medal /><h1>Identifique dois conjuntos<br />de notas.</h1><em /><p>Do <strong>2º</strong> conjunto, selecione<br />a nota que está fora do<br /><strong>1º</strong> conjunto.</p></section><section className="pf-set"><h2><span />1º CONJUNTO<span /></h2><button className={playing === 'first' ? 'playing' : ''} onClick={() => playSet('first')}>🔊</button>{data.first.map((n) => <div className="pf-note" key={n}><span>♪</span><b>{n}</b></div>)}</section><section className="pf-set"><h2><span />2º CONJUNTO<span /></h2><button className={playing === 'second' ? 'playing' : ''} onClick={() => playSet('second')}>🔊</button>{data.second.map((n, i) => <button className={`pf-answer ${selected === i ? 'selected' : ''}`} key={`${n}-${i}`} onClick={() => setSelected(i)}><span>♪</span><i /></button>)}</section>{selected != null && <button className="pf-send" onClick={submit}>Enviar</button>}{result !== 'idle' && <div className={`pf-feedback ${result}`}>{result === 'right' ? '✓' : '×'}</div>}</section>; }
function SingScreen({ data, voice, run, result }: { data: FlowData; voice: { target: number; heard: string | null; active: boolean; done: boolean[] }; run: () => void; result: 'idle' | 'right' | 'wrong' }) { return <section className="pf-sing"><h1>Ouça as duas notas.<br />Depois cante na mesma ordem.</h1><div className="pf-staff">{staff.map((n) => <div key={n}><span>{n}</span><i /></div>)}{data.sing.map((n, i) => <button key={`${n}-${i}`} className={voice.done[i] ? 'done' : ''} style={{ top: `${y(n)}%`, left: `${i ? 75 : 32}%` }}>{voice.done[i] ? '✓' : n}</button>)}{voice.heard && <em style={{ top: `${y(voice.heard)}%`, left: `${voice.target ? 75 : 32}%` }} />}</div><button className="pf-big" onClick={run}>🔊</button><small>{voice.active ? 'cante a nota indicada' : 'toque para ouvir as duas notas'}</small>{result !== 'idle' && <div className={`pf-feedback ${result}`}>{result === 'right' ? '✓' : '×'}</div>}</section>; }
function RhythmScreen({ bpm, beat, phase, score, quality, demo, tap }: { bpm: number; beat: number; phase: string; score: Score; quality: string | null; demo: () => void; tap: () => void }) { return <section className="pf-rhythm"><div className="pf-rtitle"><Medal /><h1>Observe a bateria,<br />em seguida toque<br />seguindo o ritmo.</h1></div><div className="pf-beats"><div>♩ = {bpm}<br /><small>4/4</small></div>{[0,1,2,3].map((i) => <span key={i} className={beat === i ? 'on' : ''} />)}</div><button className={`pf-tap ${quality || ''}`} onClick={tap} disabled={phase !== 'play'}><b>{phase === 'done' ? 'Concluído' : 'Toque aqui'}</b></button><p className="pf-score">Perfeito: <strong>{score.perfect}</strong> | Ótimo: <strong>{score.great}</strong> | Bom: <strong>{score.good}</strong><br />Perdido: <strong>{score.missed}</strong></p><small>{phase === 'ready' || phase === 'demo' ? 'Demonstração...' : phase === 'play' ? 'Sua vez' : 'Avançando...'}</small><button className="pf-demo" onClick={demo} disabled={phase !== 'ready'}>🔊</button></section>; }
function IntervalScreen({ choice, setChoice, play, playing, submit, result }: { choice: 'subiu' | 'desceu' | null; setChoice: (v: 'subiu' | 'desceu') => void; play: () => void; playing: boolean; submit: () => void; result: 'idle' | 'right' | 'wrong' }) { return <section className="pf-interval"><div className="pf-rtitle"><Medal /><h1>O intervalo<br />subiu ou desceu?</h1></div><button className={`pf-demo interval-play ${playing ? 'playing' : ''}`} onClick={play}>🔊</button><div className="pf-choice"><button className={choice === 'subiu' ? 'selected' : ''} onClick={() => setChoice('subiu')}>Subiu</button><button className={choice === 'desceu' ? 'selected' : ''} onClick={() => setChoice('desceu')}>Desceu</button></div>{choice && <button className="pf-send main-send" onClick={submit}>Finalizar</button>}{result !== 'idle' && <div className={`pf-feedback ${result}`}>{result === 'right' ? '✓' : '×'}</div>}</section>; }

const css = `.premium-flow{--gold:#d7a34d;--gold2:#ffd482;height:100dvh;max-height:100dvh;position:relative;overflow:hidden;padding:calc(26px + env(safe-area-inset-top)) 18px calc(20px + env(safe-area-inset-bottom));color:#f4ead8;background:radial-gradient(circle at 50% -8%,rgba(255,220,140,.12),transparent 25%),radial-gradient(circle at 50% 34%,rgba(215,163,77,.09),transparent 36%),linear-gradient(180deg,#17191b,#0d0f11 58%,#060708);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;text-align:center}.premium-flow:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(110deg,rgba(255,255,255,.018) 0 1px,transparent 1px 24px),radial-gradient(circle at 50% 52%,rgba(255,255,255,.052),transparent 24%);opacity:.7;pointer-events:none}.premium-flow>*{position:relative;z-index:1}.pf-top{height:8.2dvh;width:min(100%,430px);margin:0 auto;display:grid;grid-template-columns:88px 1fr 48px;align-items:center;gap:10px}.pf-top button{width:88px;height:42px;border:1.4px solid var(--gold);border-radius:999px;background:rgba(215,163,77,.035);color:var(--gold2);font:900 18px system-ui;box-shadow:0 0 18px rgba(215,163,77,.10)}.pf-top span{text-align:center;color:var(--gold2);font-size:22px;letter-spacing:.18em}.pf-top i{width:46px;height:46px;border:1.4px solid var(--gold);border-radius:50%;display:grid;place-items:center;color:var(--gold2);font:900 25px system-ui;font-style:normal}.pf-icons{height:8.1dvh;width:min(100%,430px);margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:18px;align-items:center}.pf-icons span{height:42px;display:grid;place-items:center;color:rgba(255,255,255,.38);font-size:29px;position:relative;filter:grayscale(1)}.pf-icons .active{color:var(--gold2);filter:none;text-shadow:0 0 18px rgba(215,163,77,.34)}.pf-icons .active:after{content:'';position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);width:58px;height:2px;background:var(--gold2)}.pf-icons b{display:none}.pf-icons .done b{display:block;position:absolute;bottom:-17px;color:#fff;font-size:18px}.pf-note-stage,.pf-sing,.pf-rhythm,.pf-interval{height:calc(100dvh - 16.3dvh - 58px - env(safe-area-inset-top) - env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:1.4dvh;overflow:hidden}.pf-card{position:relative;width:min(100%,332px);height:28dvh;max-height:240px;min-height:192px;border:1.2px solid rgba(215,163,77,.58);border-radius:28px;background:linear-gradient(145deg,rgba(215,163,77,.105),rgba(255,255,255,.018) 42%,rgba(0,0,0,.05));box-shadow:0 0 34px rgba(215,163,77,.10),inset 0 0 42px rgba(215,163,77,.028);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:34px 26px 20px}.pf-medal{position:absolute;top:-31px;left:50%;transform:translateX(-50%);width:62px;height:62px;border:2px solid var(--gold2);border-radius:50%;display:grid;place-items:center;background:#171516;color:var(--gold2);box-shadow:0 0 22px rgba(215,163,77,.22)}.pf-medal b{position:absolute;top:-21px;font-size:24px;line-height:1;color:var(--gold2);font-family:serif}.pf-medal span{font-size:29px;line-height:1}.pf-card h1{font:900 clamp(19px,5vw,24px)/1.12 ui-monospace,SFMono-Regular,monospace;color:#f5f2ec;margin:0}.pf-card em{width:44px;height:2px;background:var(--gold2);display:block;margin:13px 0 12px}.pf-card p{margin:0;color:rgba(245,242,236,.66);font-size:clamp(14px,4vw,17px);line-height:1.32}.pf-card strong{color:var(--gold2)}.pf-set{position:relative;width:min(100%,350px);height:17.5dvh;max-height:148px;min-height:122px;border:1px solid rgba(215,163,77,.22);border-radius:22px;background:rgba(255,255,255,.017);box-shadow:inset 0 0 26px rgba(255,255,255,.012),0 0 22px rgba(0,0,0,.20);padding:18px 22px 14px;display:grid;grid-template-columns:70px 1fr 1fr;gap:18px;align-items:center}.pf-set h2{position:absolute;top:-14px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:52px auto 52px;align-items:center;gap:8px;color:var(--gold2);font-size:15px;font-weight:500;letter-spacing:.08em;white-space:nowrap;margin:0}.pf-set h2 span{height:1px;background:rgba(215,163,77,.28);position:relative}.pf-set h2 span:after{content:'';position:absolute;right:-3px;top:-2px;width:5px;height:5px;border-radius:50%;background:var(--gold2)}.pf-set h2 span:last-child:after{right:auto;left:-3px}.pf-set>button:first-of-type,.pf-big,.pf-demo{border:2px solid var(--gold2);border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.17),rgba(255,255,255,.02));color:#fff;box-shadow:0 0 20px rgba(215,163,77,.20)}.pf-set>button:first-of-type{width:64px;height:64px;font-size:28px}.pf-set .playing,.pf-demo.playing{transform:scale(.96);box-shadow:0 0 34px rgba(215,163,77,.44)}.pf-note,.pf-answer{display:grid;place-items:center;border:0;background:transparent;color:#e8e8e8;min-height:70px}.pf-note span,.pf-answer span{font-size:38px;line-height:.76;color:var(--gold2);text-shadow:0 0 14px rgba(215,163,77,.20)}.pf-note b{margin-top:6px;font:700 22px system-ui;color:#e9e9e9}.pf-answer i{width:28px;height:28px;border:2px solid rgba(255,255,255,.65);border-radius:50%;margin-top:8px;display:block}.pf-answer.selected i{background:var(--gold2);border-color:var(--gold2);box-shadow:0 0 20px rgba(215,163,77,.48)}.pf-send{position:absolute;right:18px;bottom:calc(14px + env(safe-area-inset-bottom));border:0;border-radius:999px;background:linear-gradient(180deg,#ffe0a0,#d7a34d);color:#16110a;font:900 14px system-ui;text-transform:uppercase;padding:12px 18px;z-index:8}.pf-feedback{position:fixed;inset:0;display:grid;place-items:center;font-size:78px;font-weight:950;color:#43ff83;text-shadow:0 0 34px rgba(67,255,131,.72);background:rgba(0,0,0,.18);z-index:10}.pf-feedback.wrong{color:#ff4242}.pf-sing h1,.pf-rtitle h1,.pf-interval h1{font:900 clamp(21px,5.7vw,27px)/1.12 ui-monospace,SFMono-Regular,monospace;margin:0 auto;max-width:360px}.pf-staff{position:relative;width:min(100%,365px);height:48dvh;max-height:430px;min-height:338px;margin:0 auto}.pf-staff div{display:grid;grid-template-columns:40px 1fr;align-items:center;height:8.33%;color:rgba(255,255,255,.44);font:800 13px system-ui}.pf-staff i{height:1px;background:rgba(255,255,255,.26)}.pf-staff button{position:absolute;transform:translate(-50%,-50%);width:54px;height:54px;border:2px solid var(--gold2);border-radius:50%;background:rgba(0,0,0,.22);color:var(--gold2);font-weight:900}.pf-staff button.done{border-color:#48ff8a;color:#48ff8a}.pf-staff em{position:absolute;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;background:#f81919;box-shadow:0 0 18px rgba(248,25,25,.7)}.pf-big,.pf-demo{width:72px;height:72px;font-size:30px}.pf-sing small,.pf-rhythm small,.pf-interval small{display:block;color:rgba(255,255,255,.55);font-size:15px}.pf-rtitle{position:relative;margin-top:22px;padding-top:50px;min-height:128px;display:flex;align-items:flex-end;justify-content:center}.pf-rtitle .pf-medal{top:0}.pf-beats{width:min(100%,390px);display:grid;grid-template-columns:82px repeat(4,1fr);gap:14px;align-items:center}.pf-beats div{height:64px;border:1px solid rgba(215,163,77,.2);border-radius:16px;display:grid;place-items:center;color:var(--gold2);font-size:20px}.pf-beats small{font-size:16px}.pf-beats span{width:22px;height:38px;border:2px solid var(--gold2);border-radius:3px;justify-self:center}.pf-beats .on{background:linear-gradient(180deg,#ffdc91,#d7a34d);box-shadow:0 0 28px rgba(255,212,130,.55)}.pf-tap{width:min(100%,390px);height:24dvh;min-height:180px;max-height:230px;border:1.4px solid rgba(215,163,77,.42);border-radius:24px;background:radial-gradient(circle at 50% 52%,rgba(215,163,77,.18),rgba(255,255,255,.02) 28%,rgba(255,255,255,.012));color:var(--gold2);font:700 22px system-ui}.pf-tap b{display:grid;place-items:center;margin:auto;width:126px;height:126px;border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.24),rgba(215,163,77,.05) 60%,transparent)}.pf-score{width:min(100%,390px);border:1px solid rgba(255,255,255,.08);border-radius:18px;margin:0 auto;padding:12px 13px;color:var(--gold2);font-size:14px;line-height:1.5;background:rgba(0,0,0,.12)}.pf-score strong{color:#fff}.pf-interval{justify-content:center;gap:5dvh}.interval-play{width:92px;height:92px;font-size:36px}.pf-choice{width:min(100%,390px);display:grid;grid-template-columns:1fr 1fr;gap:14px}.pf-choice button{height:56px;border:1.5px solid rgba(215,163,77,.42);border-radius:999px;background:rgba(255,255,255,.025);color:rgba(255,255,255,.8);font:900 18px system-ui}.pf-choice button.selected{background:linear-gradient(180deg,#ffe0a0,#d7a34d);color:#15110b}.main-send{position:static}@media(max-height:760px){.premium-flow{padding-top:calc(18px + env(safe-area-inset-top));padding-bottom:calc(14px + env(safe-area-inset-bottom))}.pf-top{height:7.4dvh}.pf-icons{height:7.2dvh}.pf-note-stage,.pf-sing,.pf-rhythm,.pf-interval{height:calc(100dvh - 14.6dvh - 46px - env(safe-area-inset-top) - env(safe-area-inset-bottom));gap:1dvh}.pf-top button{width:82px;height:38px;font-size:17px}.pf-top span{font-size:20px}.pf-top i{width:42px;height:42px;font-size:23px}.pf-icons span{font-size:26px}.pf-card{height:27dvh;min-height:178px;padding-top:30px}.pf-medal{width:56px;height:56px;top:-28px}.pf-set{height:16.5dvh;min-height:112px}.pf-set>button:first-of-type{width:58px;height:58px;font-size:25px}.pf-note span,.pf-answer span{font-size:34px}.pf-staff{height:46dvh;min-height:310px}.pf-big,.pf-demo{width:64px;height:64px}.pf-rtitle{margin-top:8px;min-height:112px}.pf-tap{height:22dvh;min-height:160px}.pf-tap b{width:108px;height:108px}.pf-score{font-size:13px;padding:10px}.pf-beats div{height:58px;font-size:18px}}`;
