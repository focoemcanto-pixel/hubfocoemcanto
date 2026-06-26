'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type Note = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
type Screen = 0 | 1 | 2;
type Score = { perfect: number; great: number; good: number; missed: number };

const notePool: Note[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const icons = ['♪', '▥', '◉', '▰', '♮', '◖'];
const staff = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];

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

function build(step: number) {
  const now = new Date();
  const r = seeded(Number(`${now.getFullYear()}${now.getMonth()+1}${now.getDate()}${step}`));
  const pick = <T,>(items: T[]) => items[Math.floor(r() * items.length) % items.length];
  const first: Note[] = [pick(['B','C','D','E','F','G'] as Note[]), pick(['C','D','E','F','G','A'] as Note[])];
  const answer = Math.floor(r() * 2);
  const second: Note[] = [...first];
  second[answer] = pick(notePool.filter((n) => n !== first[answer]));
  const sing: Note[] = [pick(['C','D','E','F','G'] as Note[]), pick(['C','D','E','F','G','A'] as Note[])];
  return { first, second, answer, sing };
}

export function DailyEarTrainingPremiumFlow({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const audioRef = useRef<AudioContext | null>(null);
  const started = useRef(Date.now());
  const data = useMemo(() => build(step.exerciseNumber), [step.exerciseNumber]);
  const [screen, setScreen] = useState<Screen>(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<'idle' | 'right' | 'wrong'>('idle');
  const [playing, setPlaying] = useState<'first' | 'second' | null>(null);
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
  async function piano(note: Note) { const c = ctx(); await c.resume().catch(() => null); const m = midi(note); void preloadPianoSamples(c, [m]); await playPianoSample(c, m, c.currentTime + .025, c.currentTime + .62, 1.05); await wait(650); }
  async function playSet(kind: 'first' | 'second') { if (playing) return; setPlaying(kind); const target = kind === 'first' ? data.first : data.second; const c = ctx(); void preloadPianoSamples(c, target.map((n) => midi(n))); for (const note of target) await piano(note); setPlaying(null); }
  async function kick() { const c = ctx(); await c.resume().catch(() => null); const o = c.createOscillator(); const g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(122, c.currentTime); o.frequency.exponentialRampToValueAtTime(48, c.currentTime + .16); g.gain.setValueAtTime(.42, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .22); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + .23); }
  function quit() { stopPianoSamples(audioRef.current ?? undefined); router.push('/aluno/central/diarios'); }
  function done() { completeDailyStep(step, Math.max(1, Math.round((Date.now() - started.current) / 1000))); stopPianoSamples(audioRef.current ?? undefined); router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`); }
  function submitNote() { if (selected == null) return; setResult(selected === data.answer ? 'right' : 'wrong'); window.setTimeout(() => { setResult('idle'); setScreen(1); }, 720); }

  async function listen(target: Note, index: number) {
    setVoice((old) => ({ ...old, target: index, heard: null, active: true }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const c = new AudioContext(); const source = c.createMediaStreamSource(stream); const analyser = c.createAnalyser(); analyser.fftSize = 2048; source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize); let ok = 0; const start = performance.now();
      while (performance.now() - start < 2300) { analyser.getFloatTimeDomainData(buffer); const heard = detected(pitch(buffer, c.sampleRate) || 0); setVoice((old) => ({ ...old, heard, active: true })); ok = heard === target ? ok + 1 : Math.max(0, ok - 1); if (ok >= 5) break; await wait(90); }
      stream.getTracks().forEach((track) => track.stop()); await c.close().catch(() => null);
      const good = ok >= 5; setVoice((old) => { const doneNotes = [...old.done]; doneNotes[index] = good; return { ...old, heard: good ? target : old.heard, active: false, done: doneNotes }; }); return good;
    } catch { setVoice((old) => ({ ...old, active: false })); return false; }
  }
  async function runSing() { if (voice.active) return; const out: boolean[] = []; for (let i = 0; i < data.sing.length; i += 1) { await piano(data.sing[i]); out[i] = await listen(data.sing[i], i); await wait(280); } setResult(out.every(Boolean) ? 'right' : 'wrong'); window.setTimeout(() => { setResult('idle'); setScreen(2); }, 720); }
  async function demo() { if (phase !== 'ready') return; setPhase('demo'); setScore({ perfect: 0, great: 0, good: 0, missed: 0 }); setTaps(0); setQuality(null); for (let i = 0; i < 4; i += 1) { setBeat(i); await kick(); await wait(beatMs); } setBeat(-1); await wait(360); setPhase('play'); rhythmStart.current = performance.now() + 500; for (let i = 0; i < 4; i += 1) window.setTimeout(() => setBeat(i), 500 + i * beatMs); window.setTimeout(() => setBeat(-1), 500 + 4 * beatMs); }
  function tap() { if (phase !== 'play' || taps >= 4) return; void kick(); const diff = Math.abs(performance.now() - (rhythmStart.current + taps * beatMs)); const q = diff <= 85 ? 'perfect' : diff <= 150 ? 'great' : diff <= 240 ? 'good' : 'missed'; setQuality(q); setScore((old) => ({ ...old, [q]: old[q as keyof Score] + 1 })); const next = taps + 1; setTaps(next); if (next >= 4) { setPhase('done'); window.setTimeout(done, 1100); } }

  return <main className="premium-flow"><style>{css}</style><Header level={exercise.level} screen={screen} quit={quit} />{screen === 0 && <NoteScreen data={data} playing={playing} selected={selected} setSelected={setSelected} playSet={playSet} submit={submitNote} result={result} />}{screen === 1 && <SingScreen data={data} voice={voice} run={runSing} result={result} />}{screen === 2 && <RhythmScreen bpm={bpm} beat={beat} phase={phase} score={score} quality={quality} demo={demo} tap={tap} />}</main>;
}

function Header({ level, screen, quit }: { level: string; screen: Screen; quit: () => void }) { return <><header className="pf-top"><button onClick={quit}>Sair</button><span>{level}</span><i>i</i></header><nav className="pf-icons">{icons.map((icon, i) => <span key={icon} className={`${i === screen ? 'active' : ''} ${i < screen ? 'done' : ''}`}>{icon}<b>✓</b></span>)}</nav></>; }
function Medal() { return <div className="pf-medal"><b>♛</b><span>◇</span></div>; }
function NoteScreen({ data, playing, selected, setSelected, playSet, submit, result }: any) { return <section className="pf-note-stage"><section className="pf-card"><Medal /><h1>Identifique dois conjuntos<br />de notas.</h1><em /><p>Do <strong>2º</strong> conjunto, selecione<br />a nota que está fora do<br /><strong>1º</strong> conjunto.</p></section><section className="pf-set"><h2><span />1º CONJUNTO<span /></h2><button className={playing === 'first' ? 'playing' : ''} onClick={() => playSet('first')}>🔊</button>{data.first.map((n: Note) => <div className="pf-note" key={n}><span>♪</span><b>{n}</b></div>)}</section><section className="pf-set"><h2><span />2º CONJUNTO<span /></h2><button className={playing === 'second' ? 'playing' : ''} onClick={() => playSet('second')}>🔊</button>{data.second.map((n: Note, i: number) => <button className={`pf-answer ${selected === i ? 'selected' : ''}`} key={`${n}-${i}`} onClick={() => setSelected(i)}><span>♪</span><i /></button>)}</section>{selected != null && <button className="pf-send" onClick={submit}>Enviar</button>}{result !== 'idle' && <div className={`pf-feedback ${result}`}>{result === 'right' ? '✓' : '×'}</div>}</section>; }
function SingScreen({ data, voice, run, result }: any) { return <section className="pf-sing"><h1>Ouça e cante as mesmas notas</h1><div className="pf-staff">{staff.map((n) => <div key={n}><span>{n}</span><i /></div>)}{data.sing.map((n: Note, i: number) => <button key={`${n}-${i}`} className={voice.done[i] ? 'done' : ''} style={{ top: `${y(n)}%`, left: `${i ? 75 : 32}%` }}>{voice.done[i] ? '✓' : n}</button>)}{voice.heard && <em style={{ top: `${y(voice.heard)}%`, left: `${voice.target ? 75 : 32}%` }} />}</div><button className="pf-big" onClick={run}>🔊</button><small>{voice.active ? 'centralize a bolinha' : 'toque e cante'}</small>{result !== 'idle' && <div className={`pf-feedback ${result}`}>{result === 'right' ? '✓' : '×'}</div>}</section>; }
function RhythmScreen({ bpm, beat, phase, score, quality, demo, tap }: any) { return <section className="pf-rhythm"><div className="pf-rtitle"><Medal /><h1>Observe a bateria,<br />em seguida, toque seguindo o ritmo.</h1></div><div className="pf-beats"><div>♩ = {bpm}<br /><small>4/4</small></div>{[0,1,2,3].map((i) => <span key={i} className={beat === i ? 'on' : ''} />)}</div><button className={`pf-tap ${quality || ''}`} onClick={tap} disabled={phase !== 'play'}><b>{phase === 'done' ? 'Concluído' : 'Toque aqui'}</b></button><p className="pf-score">Perfeito: <strong>{score.perfect}</strong> | Ótimo: <strong>{score.great}</strong> | Bom: <strong>{score.good}</strong><br />Perdido: <strong>{score.missed}</strong></p><small>{phase === 'ready' || phase === 'demo' ? 'Demonstração...' : phase === 'play' ? 'Sua vez' : 'Finalizando...'}</small><button className="pf-demo" onClick={demo} disabled={phase !== 'ready'}>🔊</button></section>; }

const css = `.premium-flow{--gold:#d7a34d;--gold2:#ffd482;height:100dvh;max-height:100dvh;position:relative;overflow:hidden;padding:calc(22px + env(safe-area-inset-top)) 18px calc(18px + env(safe-area-inset-bottom));color:#f4ead8;background:radial-gradient(circle at 50% -8%,rgba(255,220,140,.12),transparent 25%),radial-gradient(circle at 50% 34%,rgba(215,163,77,.09),transparent 36%),linear-gradient(180deg,#17191b,#0d0f11 58%,#060708);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;text-align:center;display:flex;flex-direction:column}.premium-flow:before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(110deg,rgba(255,255,255,.018) 0 1px,transparent 1px 24px),radial-gradient(circle at 50% 52%,rgba(255,255,255,.052),transparent 24%);opacity:.7;pointer-events:none}.premium-flow>*{position:relative;z-index:1}.pf-top{width:min(100%,420px);margin:0 auto;display:grid;grid-template-columns:88px 1fr 46px;align-items:center;gap:10px;flex:0 0 auto}.pf-top button{width:88px;height:44px;border:1.4px solid var(--gold);border-radius:999px;background:rgba(215,163,77,.035);color:var(--gold2);font:900 19px system-ui;box-shadow:0 0 16px rgba(215,163,77,.1)}.pf-top span{text-align:center;color:var(--gold2);font-size:22px;letter-spacing:.17em}.pf-top i{width:46px;height:46px;border:1.4px solid var(--gold);border-radius:50%;display:grid;place-items:center;color:var(--gold2);font:900 27px system-ui;font-style:normal}.pf-icons{width:min(100%,420px);margin:26px auto 0;display:grid;grid-template-columns:repeat(6,1fr);gap:15px;flex:0 0 auto}.pf-icons span{height:34px;display:grid;place-items:center;color:rgba(255,255,255,.38);font-size:28px;position:relative;filter:grayscale(1)}.pf-icons .active{color:var(--gold2);filter:none;text-shadow:0 0 16px rgba(215,163,77,.34)}.pf-icons .active:after{content:'';position:absolute;left:50%;bottom:-11px;transform:translateX(-50%);width:60px;height:2px;background:var(--gold2)}.pf-icons b{display:none}.pf-icons .done b{display:block;position:absolute;bottom:-21px;color:var(--gold2);font-size:22px}.pf-note-stage{flex:1;min-height:0;width:min(100%,390px);margin:0 auto;display:grid;grid-template-rows:minmax(165px,1.05fr) minmax(118px,.74fr) minmax(118px,.74fr);gap:clamp(14px,2.1dvh,22px);padding-top:clamp(42px,6.7dvh,64px)}.pf-card{position:relative;min-height:0;border:1.1px solid rgba(215,163,77,.58);border-radius:28px;background:linear-gradient(145deg,rgba(215,163,77,.105),rgba(255,255,255,.018) 42%,rgba(0,0,0,.05));box-shadow:0 0 34px rgba(215,163,77,.09),inset 0 0 40px rgba(215,163,77,.025);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 22px 22px}.pf-medal{position:absolute;top:-34px;left:50%;transform:translateX(-50%);width:68px;height:68px;border:2.1px solid var(--gold2);border-radius:50%;display:grid;place-items:center;background:#171516;color:var(--gold2);box-shadow:0 0 22px rgba(215,163,77,.22)}.pf-medal b{position:absolute;top:-22px;font-size:25px;line-height:1;color:var(--gold2);font-family:serif}.pf-medal span{font-size:31px;line-height:1}.pf-card h1{font:900 clamp(18px,5vw,22px)/1.14 ui-monospace,SFMono-Regular,monospace;color:#f5f2ec;margin:0}.pf-card em{width:46px;height:2px;background:var(--gold2);display:block;margin:14px 0 12px}.pf-card p{margin:0;color:rgba(245,242,236,.66);font-size:clamp(13px,3.8vw,16px);line-height:1.32}.pf-card strong{color:var(--gold2)}.pf-set{position:relative;min-height:0;border:1px solid rgba(215,163,77,.22);border-radius:24px;background:rgba(255,255,255,.017);box-shadow:inset 0 0 26px rgba(255,255,255,.012),0 0 22px rgba(0,0,0,.22);padding:24px 20px 16px;display:grid;grid-template-columns:68px 1fr 1fr;gap:20px;align-items:center}.pf-set h2{position:absolute;top:-14px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:48px auto 48px;align-items:center;gap:10px;color:var(--gold2);font-size:15px;font-weight:600;letter-spacing:.08em;white-space:nowrap;margin:0}.pf-set h2 span{height:1px;background:rgba(215,163,77,.28);position:relative}.pf-set h2 span:after{content:'';position:absolute;right:-3px;top:-2px;width:5px;height:5px;border-radius:50%;background:var(--gold2)}.pf-set h2 span:last-child:after{right:auto;left:-3px}.pf-set>button:first-of-type,.pf-big,.pf-demo{border:2px solid var(--gold2);border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.17),rgba(255,255,255,.02));color:#fff;box-shadow:0 0 20px rgba(215,163,77,.2)}.pf-set>button:first-of-type{width:68px;height:68px;font-size:28px}.pf-set .playing{transform:scale(.96);box-shadow:0 0 32px rgba(215,163,77,.44)}.pf-note,.pf-answer{display:grid;place-items:center;border:0;background:transparent;color:#e8e8e8;min-height:72px}.pf-note span,.pf-answer span{font-size:39px;line-height:.78;color:var(--gold2);text-shadow:0 0 14px rgba(215,163,77,.2)}.pf-note b{margin-top:8px;font:700 21px system-ui;color:#e9e9e9}.pf-answer i{width:29px;height:29px;border:2px solid rgba(255,255,255,.65);border-radius:50%;margin-top:10px;display:block}.pf-answer.selected i{background:var(--gold2);border-color:var(--gold2);box-shadow:0 0 22px rgba(215,163,77,.48)}.pf-send{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));border:0;border-radius:999px;background:linear-gradient(180deg,#ffe0a0,#d7a34d);color:#16110a;font:900 14px system-ui;text-transform:uppercase;padding:12px 19px;z-index:8}.pf-feedback{position:fixed;inset:0;display:grid;place-items:center;font-size:78px;font-weight:950;color:#43ff83;text-shadow:0 0 34px rgba(67,255,131,.72);background:rgba(0,0,0,.18);z-index:10}.pf-feedback.wrong{color:#ff4242}.pf-sing,.pf-rhythm{flex:1;min-height:0;width:min(100%,390px);margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding-top:clamp(26px,4dvh,42px)}.pf-sing h1,.pf-rtitle h1{font:900 clamp(18px,4.8vw,23px)/1.12 ui-monospace,SFMono-Regular,monospace;margin:0 auto;max-width:330px}.pf-staff{position:relative;width:100%;height:min(45dvh,410px);min-height:300px;margin:10px auto 8px}.pf-staff div{display:grid;grid-template-columns:38px 1fr;align-items:center;height:8.33%;color:rgba(255,255,255,.44);font:800 12px system-ui}.pf-staff i{height:1px;background:rgba(255,255,255,.26)}.pf-staff button{position:absolute;transform:translate(-50%,-50%);width:52px;height:52px;border:2px solid var(--gold2);border-radius:50%;background:rgba(0,0,0,.22);color:var(--gold2);font-weight:900}.pf-staff button.done{border-color:#48ff8a;color:#48ff8a}.pf-staff em{position:absolute;transform:translate(-50%,-50%);width:33px;height:33px;border-radius:50%;background:#f81919;box-shadow:0 0 18px rgba(248,25,25,.7)}.pf-big,.pf-demo{width:72px;height:72px;font-size:30px;flex:0 0 auto}.pf-sing small,.pf-rhythm small{display:block;color:rgba(255,255,255,.55);font-size:14px}.pf-rtitle{position:relative;padding-top:54px;margin:0 auto 8px}.pf-rtitle .pf-medal{top:0}.pf-beats{width:100%;display:grid;grid-template-columns:78px repeat(4,1fr);gap:14px;align-items:center}.pf-beats div{height:62px;border:1px solid rgba(215,163,77,.2);border-radius:17px;display:grid;place-items:center;color:var(--gold2);font-size:19px}.pf-beats small{font-size:16px}.pf-beats span{width:21px;height:36px;border:2px solid var(--gold2);border-radius:3px;justify-self:center}.pf-beats .on{background:linear-gradient(180deg,#ffdc91,#d7a34d);box-shadow:0 0 24px rgba(255,212,130,.55)}.pf-tap{width:100%;height:min(27dvh,230px);min-height:160px;border:1.3px solid rgba(215,163,77,.42);border-radius:25px;background:radial-gradient(circle at 50% 52%,rgba(215,163,77,.18),rgba(255,255,255,.02) 28%,rgba(255,255,255,.012));color:var(--gold2);font:500 21px system-ui}.pf-tap b{display:grid;place-items:center;margin:auto;width:118px;height:118px;border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.24),rgba(215,163,77,.05) 60%,transparent)}.pf-score{width:100%;border:1px solid rgba(255,255,255,.08);border-radius:18px;margin:0;padding:12px 14px;color:var(--gold2);font-size:14px;line-height:1.45;background:rgba(0,0,0,.12)}.pf-score strong{color:#fff}@media(min-width:720px){.premium-flow{padding-top:48px;padding-bottom:34px}.pf-top,.pf-icons{width:min(760px,82vw)}.pf-top{grid-template-columns:132px 1fr 66px}.pf-top button{width:132px;height:62px;font-size:27px}.pf-top span{font-size:32px}.pf-top i{width:66px;height:66px;font-size:38px}.pf-icons{gap:52px;margin-top:58px}.pf-icons span{font-size:46px}.pf-note-stage{width:564px;gap:48px;padding-top:100px;grid-template-rows:330px 218px 218px}.pf-card{padding:78px 56px 48px;border-radius:38px}.pf-card h1{font-size:29px}.pf-card p{font-size:22px}.pf-medal{width:94px;height:94px;top:-45px}.pf-medal b{top:-31px;font-size:36px}.pf-medal span{font-size:46px}.pf-set{padding:38px 44px 32px;grid-template-columns:120px 1fr 1fr;gap:54px;border-radius:34px}.pf-set>button:first-of-type{width:124px;height:124px;font-size:46px}.pf-note span,.pf-answer span{font-size:62px}.pf-note b{font-size:31px}.pf-answer i{width:46px;height:46px}.pf-sing,.pf-rhythm{width:640px}.pf-staff{height:500px}.pf-beats{grid-template-columns:120px repeat(4,1fr)}.pf-tap{height:300px}.pf-score{font-size:18px}}@media(max-height:760px) and (max-width:640px){.premium-flow{padding-top:calc(18px + env(safe-area-inset-top));padding-left:16px;padding-right:16px}.pf-top{grid-template-columns:82px 1fr 44px}.pf-top button{width:82px;height:40px;font-size:18px}.pf-top span{font-size:20px}.pf-top i{width:44px;height:44px;font-size:25px}.pf-icons{margin-top:22px}.pf-icons span{height:30px;font-size:26px}.pf-note-stage{padding-top:38px;gap:12px;grid-template-rows:minmax(150px,1fr) minmax(105px,.68fr) minmax(105px,.68fr)}.pf-card{padding:34px 18px 18px}.pf-card h1{font-size:19px}.pf-card p{font-size:13px}.pf-medal{width:60px;height:60px;top:-30px}.pf-medal b{font-size:22px;top:-19px}.pf-medal span{font-size:28px}.pf-set{padding:22px 18px 14px;grid-template-columns:62px 1fr 1fr;gap:16px}.pf-set>button:first-of-type{width:62px;height:62px;font-size:25px}.pf-note,.pf-answer{min-height:62px}.pf-note span,.pf-answer span{font-size:34px}.pf-note b{font-size:18px}.pf-answer i{width:26px;height:26px;margin-top:8px}.pf-set h2{font-size:14px;grid-template-columns:42px auto 42px}.pf-sing,.pf-rhythm{padding-top:18px}.pf-staff{height:min(39dvh,330px);min-height:250px}.pf-big,.pf-demo{width:64px;height:64px}.pf-rtitle{padding-top:44px}.pf-tap{min-height:135px}.pf-tap b{width:104px;height:104px}.pf-score{font-size:13px;padding:10px 12px}}`;
