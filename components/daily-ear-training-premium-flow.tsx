'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type Note = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
type Screen = 0 | 1 | 2 | 3 | 4;
type Result = 'idle' | 'right' | 'wrong';
type Score = { perfect: number; great: number; good: number; missed: number };
type Direction = 'asc' | 'desc';

const notePool: Note[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const blackNotes = ['C#', 'D#', 'F#', 'G#', 'A#'];
const icons = ['♪', '▥', '◉', '▰', '♮', '◖'];
const staff = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];

function seeded(seedValue: number) {
  let s = seedValue || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function midi(note: string) {
  return noteNameToMidi(`${note}4`) ?? 60;
}

function y(note: string | null) {
  const index = note ? staff.indexOf(note) : -1;
  return index >= 0 ? 7 + index * 7.6 : 50;
}

function detected(freq: number) {
  if (!Number.isFinite(freq) || freq < 70) return null;
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = Math.round(69 + 12 * Math.log2(freq / 440));
  return names[((m % 12) + 12) % 12];
}

function pitch(buffer: Float32Array, sampleRate: number) {
  const rms = Math.sqrt(buffer.reduce((a, b) => a + b * b, 0) / buffer.length);
  if (rms < 0.015) return null;
  let best = 0;
  let offset = -1;
  for (let o = 40; o < 1000; o += 1) {
    let score = 0;
    for (let i = 0; i < buffer.length - o; i += 1) score += 1 - Math.abs(buffer[i] - buffer[i + o]);
    score /= buffer.length - o;
    if (score > best) {
      best = score;
      offset = o;
    }
  }
  return best > 0.88 && offset > 0 ? sampleRate / offset : null;
}

function build(step: number) {
  const now = new Date();
  const random = seeded(Number(`${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}${step}`));
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length) % items.length];

  const first: Note[] = [pick(['B', 'C', 'D', 'E', 'F', 'G'] as Note[]), pick(['C', 'D', 'E', 'F', 'G', 'A'] as Note[])];
  const answer = Math.floor(random() * 2);
  const second: Note[] = [...first];
  second[answer] = pick(notePool.filter((note) => note !== first[answer]));

  const sing: Note[] = [pick(['C', 'D', 'E', 'F', 'G'] as Note[]), pick(['C', 'D', 'E', 'F', 'G', 'A'] as Note[])];
  const piano: Note[] = [pick(notePool), pick(notePool), pick(notePool)];
  const direction: Direction = random() > 0.5 ? 'asc' : 'desc';
  const low = pick(['C', 'D', 'E', 'F'] as Note[]);
  const high = pick(['G', 'A', 'B'] as Note[]);
  const interval: Note[] = direction === 'asc' ? [low, high] : [high, low];

  return { first, second, answer, sing, piano, direction, interval };
}

export function DailyEarTrainingPremiumFlow({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const audioRef = useRef<AudioContext | null>(null);
  const started = useRef(Date.now());
  const rhythmStart = useRef(0);

  const data = useMemo(() => build(step.exerciseNumber), [step.exerciseNumber]);
  const [screen, setScreen] = useState<Screen>(0);
  const [result, setResult] = useState<Result>('idle');
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [voice, setVoice] = useState<{ target: number; heard: string | null; active: boolean; done: boolean[] }>({ target: 0, heard: null, active: false, done: [] });
  const [phase, setPhase] = useState<'ready' | 'demo' | 'play' | 'done'>('ready');
  const [beat, setBeat] = useState(-1);
  const [tapFlash, setTapFlash] = useState(-1);
  const [taps, setTaps] = useState(0);
  const [quality, setQuality] = useState<string | null>(null);
  const [score, setScore] = useState<Score>({ perfect: 0, great: 0, good: 0, missed: 0 });
  const [pianoAnswer, setPianoAnswer] = useState<Note[]>([]);
  const [dragging, setDragging] = useState<Note | null>(null);
  const [directionChoice, setDirectionChoice] = useState<Direction | null>(null);

  const bpm = 77;
  const beatMs = Math.round(60000 / bpm);

  function ctx() {
    if (!audioRef.current) audioRef.current = new AudioContext();
    return audioRef.current;
  }

  async function playTone(note: string, visual = false) {
    const c = ctx();
    await c.resume().catch(() => null);
    const noteMidi = midi(note);
    if (visual) {
      setActiveKey(note);
      window.setTimeout(() => setActiveKey(null), 260);
    }
    void preloadPianoSamples(c, [noteMidi]);
    await playPianoSample(c, noteMidi, c.currentTime + 0.025, c.currentTime + 0.62, 1.05);
    await wait(650);
  }

  async function playSet(kind: 'first' | 'second') {
    if (playing) return;
    setPlaying(kind);
    for (const note of kind === 'first' ? data.first : data.second) await playTone(note, false);
    setPlaying(null);
  }

  async function kick() {
    const c = ctx();
    await c.resume().catch(() => null);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(122, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(48, c.currentTime + 0.16);
    gain.gain.setValueAtTime(0.42, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.22);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.23);
  }

  function quit() {
    stopPianoSamples(audioRef.current ?? undefined);
    router.push('/aluno/central/diarios');
  }

  function finish() {
    completeDailyStep(step, Math.max(1, Math.round((Date.now() - started.current) / 1000)));
    stopPianoSamples(audioRef.current ?? undefined);
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  function flash(ok: boolean, next: () => void) {
    setResult(ok ? 'right' : 'wrong');
    window.setTimeout(() => {
      setResult('idle');
      next();
    }, 780);
  }

  function submitNote() {
    if (selected == null) return;
    flash(selected === data.answer, () => setScreen(1));
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
      setVoice((old) => {
        const doneNotes = [...old.done];
        doneNotes[index] = good;
        return { ...old, heard: good ? target : old.heard, active: false, done: doneNotes };
      });
      return good;
    } catch {
      setVoice((old) => ({ ...old, active: false }));
      return false;
    }
  }

  async function runSing() {
    if (voice.active) return;
    const out: boolean[] = [];
    for (let i = 0; i < data.sing.length; i += 1) {
      await playTone(data.sing[i], false);
      out[i] = await listen(data.sing[i], i);
      await wait(280);
    }
    flash(out.every(Boolean), () => setScreen(2));
  }

  async function demo() {
    if (phase !== 'ready') return;
    setPhase('demo');
    setScore({ perfect: 0, great: 0, good: 0, missed: 0 });
    setTaps(0);
    setQuality(null);
    for (let i = 0; i < 4; i += 1) {
      setBeat(i);
      await kick();
      await wait(beatMs);
    }
    setBeat(-1);
    await wait(360);
    setPhase('play');
    rhythmStart.current = performance.now() + 500;
  }

  function tap() {
    if (phase !== 'play' || taps >= 4) return;
    void kick();
    const index = taps;
    setTapFlash(index);
    window.setTimeout(() => setTapFlash(-1), 160);
    const diff = Math.abs(performance.now() - (rhythmStart.current + index * beatMs));
    const q = diff <= 85 ? 'perfect' : diff <= 150 ? 'great' : diff <= 240 ? 'good' : 'missed';
    setQuality(q);
    setScore((old) => ({ ...old, [q]: old[q as keyof Score] + 1 }));
    const next = index + 1;
    setTaps(next);
    if (next >= 4) {
      setPhase('done');
      window.setTimeout(() => setScreen(3), 850);
    }
  }

  async function playPianoChallenge() {
    if (playing) return;
    setPlaying('piano');
    for (const note of data.piano) await playTone(note, false);
    setPlaying(null);
  }

  async function choosePiano(note: Note) {
    await playTone(note, true);
    if (pianoAnswer.length < 3) setPianoAnswer((old) => [...old, note]);
  }

  function placePiano(index: number) {
    if (!dragging) return;
    setPianoAnswer((old) => {
      const next = [...old];
      next[index] = dragging;
      return next.slice(0, 3) as Note[];
    });
    setDragging(null);
  }

  function submitPiano() {
    flash(pianoAnswer.length === 3 && pianoAnswer.join(',') === data.piano.join(','), () => setScreen(4));
  }

  async function playInterval() {
    if (playing) return;
    setPlaying('interval');
    for (const note of data.interval) await playTone(note, false);
    setPlaying(null);
  }

  function submitInterval(choice: Direction) {
    setDirectionChoice(choice);
    flash(choice === data.direction, finish);
  }

  return (
    <main className="premium-flow">
      <style>{css}</style>
      <Header level={exercise.level} screen={screen} quit={quit} />
      {screen === 0 && <NoteScreen data={data} playing={playing} selected={selected} setSelected={setSelected} playSet={playSet} submit={submitNote} result={result} />}
      {screen === 1 && <SingScreen data={data} voice={voice} run={runSing} result={result} />}
      {screen === 2 && <RhythmScreen bpm={bpm} beat={beat} tapFlash={tapFlash} phase={phase} score={score} quality={quality} demo={demo} tap={tap} result={result} />}
      {screen === 3 && <PianoScreen answer={pianoAnswer} activeKey={activeKey} playChallenge={playPianoChallenge} choose={choosePiano} dragging={dragging} setDragging={setDragging} place={placePiano} reset={() => setPianoAnswer([])} submit={submitPiano} result={result} playing={playing === 'piano'} />}
      {screen === 4 && <IntervalScreen choice={directionChoice} play={playInterval} playing={playing === 'interval'} submit={submitInterval} result={result} />}
    </main>
  );
}

function Header({ level, screen, quit }: { level: string; screen: Screen; quit: () => void }) {
  return (
    <>
      <header className="pf-top"><button onClick={quit}>Sair</button><span>{level}</span><i>i</i></header>
      <nav className="pf-icons">
        {icons.map((icon, index) => <span key={icon} className={`${index === screen ? 'active' : ''} ${index < screen ? 'done' : ''}`}>{icon}<b>✓</b></span>)}
      </nav>
    </>
  );
}

function Medal() { return <div className="pf-medal"><b>♛</b><span>◇</span></div>; }

function NoteScreen({ data, playing, selected, setSelected, playSet, submit, result }: any) {
  return <><section className="pf-card"><Medal /><h1>Identifique dois conjuntos<br />de notas.</h1><em /><p>Do <strong>2º</strong> conjunto, selecione<br />a nota que está fora do<br /><strong>1º</strong> conjunto.</p></section><section className="pf-set"><h2><span />1º CONJUNTO<span /></h2><button className={playing === 'first' ? 'playing' : ''} onClick={() => playSet('first')}>🔊</button>{data.first.map((n: Note) => <div className="pf-note" key={n}><span>♪</span><b>{n}</b></div>)}</section><section className="pf-set"><h2><span />2º CONJUNTO<span /></h2><button className={playing === 'second' ? 'playing' : ''} onClick={() => playSet('second')}>🔊</button>{data.second.map((n: Note, i: number) => <button className={`pf-answer ${selected === i ? 'selected' : ''}`} key={`${n}-${i}`} onClick={() => setSelected(i)}><span>♪</span><i /></button>)}</section>{selected != null && <button className="pf-send" onClick={submit}>Enviar</button>}{result !== 'idle' && <Feedback result={result} />}</>;
}

function SingScreen({ data, voice, run, result }: any) {
  return <section className="pf-sing"><h1>Ouça e cante as mesmas notas</h1><div className="pf-staff">{staff.map((n) => <div key={n}><span>{n}</span><i /></div>)}{data.sing.map((n: Note, i: number) => <button key={`${n}-${i}`} className={voice.done[i] ? 'done' : ''} style={{ top: `${y(n)}%`, left: `${i ? 75 : 32}%` }}>{voice.done[i] ? '✓' : n}</button>)}{voice.heard && <em style={{ top: `${y(voice.heard)}%`, left: `${voice.target ? 75 : 32}%` }} />}</div><button className="pf-big" onClick={run}>🔊</button><small>{voice.active ? 'centralize a bolinha' : 'toque e cante'}</small>{result !== 'idle' && <Feedback result={result} />}</section>;
}

function RhythmScreen({ bpm, beat, tapFlash, phase, score, quality, demo, tap, result }: any) {
  return <section className="pf-rhythm"><div className="pf-rtitle"><Medal /><h1>Observe a bateria,<br />em seguida, toque seguindo o ritmo.</h1></div><div className="pf-beats"><div>♩ = {bpm}<br /><small>4/4</small></div>{[0,1,2,3].map((i) => <span key={i} className={beat === i || tapFlash === i ? 'on' : ''} />)}</div><button className={`pf-tap ${quality || ''}`} onClick={tap} disabled={phase !== 'play'}><b>{phase === 'done' ? 'Concluído' : 'Toque aqui'}</b></button><p className="pf-score">Perfeito: <strong>{score.perfect}</strong> | Ótimo: <strong>{score.great}</strong> | Bom: <strong>{score.good}</strong><br />Perdido: <strong>{score.missed}</strong></p><small>{phase === 'ready' || phase === 'demo' ? 'Demonstração...' : phase === 'play' ? 'Sua vez' : 'Finalizando...'}</small><button className="pf-demo" onClick={demo} disabled={phase !== 'ready'}>🔊</button>{result !== 'idle' && <Feedback result={result} />}</section>;
}

function PianoScreen({ answer, activeKey, playChallenge, choose, dragging, setDragging, place, reset, submit, result, playing }: any) {
  return <section className="pf-piano"><div className="pf-ptitle"><Medal /><h1>Ouça a(s) nota(s) de uma oitava inferior<br />ou superior.</h1><p>Encontre e selecione as mesmas notas no teclado.</p></div><div className="pf-keyboard">{blackNotes.map((n, i) => <span key={n} className={`black b${i}`}>{n}</span>)}{notePool.map((n) => <button key={n} className={activeKey === n ? 'on' : ''} draggable onDragStart={() => setDragging(n)} onPointerDown={() => setDragging(n)} onClick={() => choose(n)}><b>{n}</b></button>)}</div><p className="pf-drag-text">Pressione e segure o piano e arraste para a <strong>Área de Resposta...</strong></p><div className="pf-slots">{[0,1,2].map((i) => <button key={i} onDragOver={(event) => event.preventDefault()} onDrop={() => place(i)} onPointerUp={() => place(i)}>{answer[i] || ''}</button>)}</div><button className={`pf-big ${playing ? 'playing' : ''}`} onClick={playChallenge}>🔊</button>{answer.length ? <button className="pf-reset" onClick={reset}>Redefinir</button> : null}{answer.length === 3 ? <button className="pf-send" onClick={submit}>Enviar</button> : null}{result !== 'idle' && <Feedback result={result} />}</section>;
}

function IntervalScreen({ choice, play, playing, submit, result }: { choice: Direction | null; play: () => void; playing: boolean; submit: (choice: Direction) => void; result: Result }) {
  return <section className="pf-interval"><div className="pf-ititle"><Medal /><h1>Ouça as duas notas<br />Elas estão <strong>ascendentes</strong> ou <strong>descendentes</strong>?</h1></div><div className="pf-interval-cards"><article><b>1st</b><span>♪</span></article><article><b>2nd</b><span>♪</span></article></div><div className="pf-divider" /><button className={`pf-big ${playing ? 'playing' : ''}`} onClick={play}>🔊</button><div className="pf-choices"><button className={choice === 'asc' ? 'selected' : ''} onClick={() => submit('asc')}>Ascendente</button><button className={choice === 'desc' ? 'selected' : ''} onClick={() => submit('desc')}>Descendente</button></div>{result !== 'idle' && <Feedback result={result} />}</section>;
}

function Feedback({ result }: { result: Result }) {
  return <div className={`pf-feedback ${result}`}>{result === 'right' ? '✓' : '×'}</div>;
}

const css = `
.premium-flow{--gold:#d7a34d;--gold2:#ffd482;min-height:100dvh;position:relative;overflow-x:hidden;padding:calc(34px + env(safe-area-inset-top)) 22px calc(36px + env(safe-area-inset-bottom));color:#f4ead8;background:radial-gradient(circle at 50% -8%,rgba(255,220,140,.12),transparent 25%),radial-gradient(circle at 50% 34%,rgba(215,163,77,.09),transparent 32%),linear-gradient(180deg,#17191b,#0d0f11 58%,#07080a);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;text-align:center}.premium-flow:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(110deg,rgba(255,255,255,.018) 0 1px,transparent 1px 24px);pointer-events:none}.premium-flow *{box-sizing:border-box}.premium-flow>*{position:relative;z-index:1}.pf-top{display:grid;grid-template-columns:82px 1fr 48px;align-items:center;gap:10px}.pf-top button{width:82px;height:40px;border:2px solid var(--gold);border-radius:999px;background:rgba(215,163,77,.04);color:var(--gold2);font:900 17px system-ui}.pf-top span{color:var(--gold2);font-size:24px;letter-spacing:.15em}.pf-top i{width:46px;height:46px;border:2px solid var(--gold);border-radius:50%;display:grid;place-items:center;color:var(--gold2);font:900 28px system-ui;font-style:normal}.pf-icons{height:62px;margin:30px auto 0;display:grid;grid-template-columns:repeat(6,1fr);gap:14px;max-width:520px}.pf-icons span{height:38px;display:grid;place-items:center;color:rgba(255,255,255,.42);font-size:30px;position:relative;filter:grayscale(1)}.pf-icons .active{color:var(--gold2);filter:none;text-shadow:0 0 22px rgba(215,163,77,.45)}.pf-icons .active:after{content:'';position:absolute;bottom:-16px;width:68px;height:2px;background:var(--gold2)}.pf-icons b{display:none}.pf-icons .done b{display:block;position:absolute;bottom:-29px;color:var(--gold2);font-size:28px}.pf-card{width:min(492px,72vw);min-height:210px;margin:72px auto 54px;border:1px solid rgba(215,163,77,.55);border-radius:32px;background:linear-gradient(145deg,rgba(215,163,77,.1),rgba(255,255,255,.018));box-shadow:0 0 48px rgba(215,163,77,.1);padding:62px 24px 28px}.pf-medal{position:absolute;top:-38px;left:50%;transform:translateX(-50%);width:76px;height:76px;border:3px solid var(--gold2);border-radius:50%;display:grid;place-items:center;background:#171516;color:var(--gold2);box-shadow:0 0 30px rgba(215,163,77,.25)}.pf-medal:before,.pf-medal:after{content:'';position:absolute;top:50%;width:118px;height:1px;background:linear-gradient(90deg,transparent,rgba(215,163,77,.48))}.pf-medal:before{right:100%}.pf-medal:after{left:100%;transform:scaleX(-1)}.pf-medal b{position:absolute;top:-27px;font-size:30px;font-family:serif}.pf-medal span{font-size:36px}.pf-card h1{font:900 22px/1.16 ui-monospace,SFMono-Regular,monospace;margin:0}.pf-card em{width:54px;height:2px;background:var(--gold2);display:block;margin:22px auto 18px}.pf-card p{margin:0;color:rgba(245,242,236,.66);font-size:17px;line-height:1.32}.pf-card strong,.pf-drag-text strong,.pf-ititle strong{color:var(--gold2)}.pf-set{width:min(560px,82vw);min-height:130px;margin:0 auto 52px;border:1px solid rgba(215,163,77,.20);border-radius:26px;background:rgba(255,255,255,.018);display:grid;grid-template-columns:86px 1fr 1fr;gap:28px;align-items:center;padding:30px 30px 22px}.pf-set h2{position:absolute;top:-17px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:62px auto 62px;gap:10px;align-items:center;color:var(--gold2);font-size:18px;font-weight:500;white-space:nowrap}.pf-set h2 span{height:1px;background:rgba(215,163,77,.28)}.pf-set>button:first-of-type,.pf-big,.pf-demo{width:82px;height:82px;border:3px solid var(--gold2);border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.16),rgba(255,255,255,.02));font-size:32px;box-shadow:0 0 26px rgba(215,163,77,.20)}.playing{box-shadow:0 0 42px rgba(215,163,77,.45)!important}.pf-note,.pf-answer{display:grid;place-items:center;background:transparent;border:0;color:#fff}.pf-note span,.pf-answer span{font-size:44px;color:var(--gold2);line-height:.8}.pf-note b{font:700 22px system-ui;color:#e9e9e9;margin-top:6px}.pf-answer i{width:34px;height:34px;border:2px solid rgba(255,255,255,.62);border-radius:50%;margin-top:10px}.pf-answer.selected i{background:var(--gold2);box-shadow:0 0 24px rgba(215,163,77,.45)}.pf-send{position:fixed;right:24px;bottom:24px;border:1px solid var(--gold);border-radius:999px;background:rgba(215,163,77,.08);color:var(--gold2);font:800 17px system-ui;padding:10px 22px;z-index:8}.pf-reset{position:fixed;left:24px;bottom:24px;border:0;background:transparent;color:var(--gold2);font:800 17px system-ui;text-shadow:0 0 18px rgba(215,163,77,.28);z-index:8}.pf-feedback{position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.28);backdrop-filter:blur(4px);font:950 82px system-ui;z-index:9}.pf-feedback.right{color:#10df73}.pf-feedback.wrong{color:#ff3030}.pf-sing h1{margin:72px auto 24px;font:900 24px/1.18 ui-monospace,SFMono-Regular,monospace}.pf-staff{position:relative;height:430px;margin:0 auto 16px}.pf-staff div{display:grid;grid-template-columns:40px 1fr;align-items:center;height:8.33%;color:rgba(255,255,255,.56);font:900 18px system-ui}.pf-staff i{height:1px;background:rgba(255,255,255,.42)}.pf-staff button{position:absolute;width:62px;height:62px;border:4px solid #fff;border-radius:50%;background:rgba(255,255,255,.04);color:#fff;font:900 20px system-ui;transform:translate(-50%,-50%)}.pf-staff button.done{border-color:#10df73;color:#10df73}.pf-staff em{position:absolute;width:42px;height:42px;border:4px solid #fff;border-radius:50%;background:#ff1717;box-shadow:0 0 22px rgba(255,0,0,.5);transform:translate(-50%,-50%);transition:top .1s ease}.pf-sing small,.pf-rhythm small{display:block;color:rgba(215,163,77,.5);font:400 18px system-ui;margin-top:8px}.pf-rhythm,.pf-piano,.pf-interval{margin-top:54px}.pf-rtitle,.pf-ptitle,.pf-ititle{position:relative;padding-top:76px;margin-bottom:30px}.pf-rtitle h1,.pf-ptitle h1,.pf-ititle h1{font:400 21px/1.35 system-ui;margin:0 0 12px;color:rgba(255,255,255,.9)}.pf-rtitle h1{font-size:23px}.pf-rtitle .pf-medal,.pf-ptitle .pf-medal,.pf-ititle .pf-medal{width:72px;height:72px;top:-4px}.pf-rtitle .pf-medal b,.pf-ptitle .pf-medal b,.pf-ititle .pf-medal b{font-size:28px}.pf-rtitle .pf-medal span,.pf-ptitle .pf-medal span,.pf-ititle .pf-medal span{font-size:34px}.pf-beats{width:min(680px,86vw);display:grid;grid-template-columns:90px repeat(4,1fr);gap:20px;align-items:center;margin:0 auto 24px}.pf-beats div{height:76px;border:1px solid rgba(215,163,77,.2);border-radius:18px;display:grid;place-items:center;color:var(--gold2);font-size:24px}.pf-beats div small{font-size:25px;color:var(--gold2);margin:0}.pf-beats span{width:28px;height:40px;border:2px solid var(--gold2);border-radius:3px;justify-self:center;position:relative;background:transparent}.pf-beats span:after{content:'';position:absolute;inset:6px;border-radius:2px;background:rgba(255,212,130,.07)}.pf-beats .on:after{background:linear-gradient(180deg,#ffdc91,#d7a34d);box-shadow:0 0 34px rgba(255,212,130,.70)}.pf-tap{width:min(680px,86vw);height:230px;border:1px solid rgba(215,163,77,.42);border-radius:28px;background:radial-gradient(circle at 50% 52%,rgba(215,163,77,.18),rgba(255,255,255,.018) 28%,transparent);color:var(--gold2);font:400 23px system-ui}.pf-tap b{display:grid;place-items:center;margin:auto;width:132px;height:132px;border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.24),rgba(215,163,77,.05) 60%,transparent);font-weight:400}.pf-score{width:min(620px,80vw);border:1px solid rgba(255,255,255,.08);border-radius:20px;margin:24px auto 12px;padding:12px;color:var(--gold2);font:400 18px/1.45 system-ui}.pf-score strong{color:#fff;font-weight:400}.pf-demo{width:74px;height:74px;font-size:28px;margin-top:6px}.pf-ptitle p{font:400 19px/1.4 system-ui;margin:0;color:rgba(255,255,255,.86)}.pf-keyboard{position:relative;width:min(720px,90vw);height:236px;margin:0 auto 30px;border:1px solid rgba(215,163,77,.32);border-radius:30px;padding:58px 24px 28px;display:grid;grid-template-columns:repeat(7,1fr);background:rgba(255,255,255,.015);box-shadow:0 0 36px rgba(215,163,77,.08)}.pf-keyboard>button{border:1px solid rgba(0,0,0,.45);background:linear-gradient(90deg,#ede8da,#fffaf0 45%,#d4cdbf);color:#282828;font:900 24px system-ui;display:flex;align-items:flex-end;justify-content:center;padding-bottom:18px;box-shadow:inset 0 -16px 28px rgba(0,0,0,.08)}.pf-keyboard>button.on,.pf-keyboard>button:active{transform:translateY(3px);filter:brightness(.86);box-shadow:inset 0 8px 20px rgba(0,0,0,.24),0 0 28px rgba(215,163,77,.42)}.pf-keyboard .black{position:absolute;top:40px;width:52px;height:120px;background:linear-gradient(180deg,#000,#1e1e1e 70%,#484848);color:var(--gold2);font:900 17px system-ui;padding-top:8px;border-radius:0 0 6px 6px;box-shadow:0 12px 18px rgba(0,0,0,.46),inset 0 -18px 22px rgba(255,255,255,.15);z-index:3}.pf-keyboard .b0{left:17%}.pf-keyboard .b1{left:29%}.pf-keyboard .b2{left:55%}.pf-keyboard .b3{left:67%}.pf-keyboard .b4{left:79%}.pf-drag-text{font:400 17px/1.35 system-ui;color:rgba(255,255,255,.78);margin:0 auto 22px}.pf-slots{display:flex;justify-content:center;gap:36px;margin:0 0 28px}.pf-slots button{width:72px;height:72px;border:2px dashed var(--gold2);border-radius:50%;background:rgba(215,163,77,.03);color:#fff;font:900 24px system-ui;box-shadow:0 0 20px rgba(215,163,77,.08)}.pf-interval-cards{display:grid;grid-template-columns:1fr 1fr;gap:28px;width:min(640px,82vw);margin:64px auto 54px}.pf-interval-cards article{height:240px;border:1px solid rgba(215,163,77,.52);border-radius:26px;background:radial-gradient(circle at 50% 60%,rgba(215,163,77,.13),rgba(255,255,255,.015));display:grid;place-items:center;color:var(--gold2)}.pf-interval-cards b{font:800 32px system-ui}.pf-interval-cards span{font-size:84px;text-shadow:0 0 24px rgba(215,163,77,.34)}.pf-divider{width:min(660px,82vw);height:1px;margin:0 auto 34px;background:linear-gradient(90deg,transparent,rgba(215,163,77,.45),transparent)}.pf-choices{display:flex;justify-content:center;gap:18px;margin:28px auto 0}.pf-choices button{border:1px solid rgba(215,163,77,.55);border-radius:999px;background:rgba(215,163,77,.06);color:var(--gold2);font:900 18px system-ui;padding:13px 20px;text-transform:uppercase}.pf-choices button.selected{background:var(--gold2);color:#16110a}@media(max-width:520px){.premium-flow{padding-left:18px;padding-right:18px}.pf-top{grid-template-columns:78px 1fr 46px}.pf-top button{width:78px;height:38px;font-size:16px}.pf-top span{font-size:21px}.pf-top i{width:44px;height:44px}.pf-icons{gap:12px;margin-top:24px}.pf-icons span{font-size:28px}.pf-card{width:76vw;margin-top:58px;margin-bottom:40px}.pf-set{grid-template-columns:72px 1fr 1fr;gap:18px;padding-left:20px;padding-right:20px}.pf-set>button:first-of-type{width:70px;height:70px}.pf-staff{height:360px}.pf-beats{gap:14px;grid-template-columns:76px repeat(4,1fr)}.pf-beats div{height:64px;font-size:20px}.pf-beats div small{font-size:21px}.pf-tap{height:190px}.pf-tap b{width:112px;height:112px}.pf-score{font-size:15px}.pf-piano,.pf-interval{margin-top:38px}.pf-ptitle,.pf-ititle{padding-top:64px;margin-bottom:20px}.pf-ptitle h1,.pf-ititle h1{font-size:17px}.pf-ptitle p{font-size:16px}.pf-keyboard{height:190px;padding:46px 12px 22px;border-radius:22px}.pf-keyboard>button{font-size:20px;padding-bottom:12px}.pf-keyboard .black{width:36px;height:92px;top:33px;font-size:13px}.pf-slots{gap:24px}.pf-slots button{width:58px;height:58px}.pf-big{width:68px;height:68px}.pf-drag-text{font-size:14px;margin-bottom:16px}.pf-interval-cards{gap:16px;margin:44px auto 34px}.pf-interval-cards article{height:176px}.pf-interval-cards b{font-size:24px}.pf-interval-cards span{font-size:64px}.pf-choices button{font-size:14px;padding:11px 14px}}
`;
