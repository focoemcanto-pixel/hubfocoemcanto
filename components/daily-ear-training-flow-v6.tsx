'use client';

import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type Note = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;
type Mark = 'right' | 'wrong' | null;
type Direction = 'asc' | 'desc';
type ScoreKey = 'perfect' | 'great' | 'good' | 'missed';
type Score = Record<ScoreKey, number>;

const notes: Note[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const blackNotes = ['C#', 'D#', 'F#', 'G#', 'A#'];
const staffRows = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomFor(seedValue: number) {
  let seed = seedValue || 1;
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function choose<T>(random: () => number, items: T[]) {
  return items[Math.floor(random() * items.length) % items.length];
}

function toMidi(note: string) {
  return noteNameToMidi(`${note}4`) ?? 60;
}

function noteY(note: string | null) {
  const index = note ? staffRows.indexOf(note) : -1;
  return index >= 0 ? 7 + index * 7.6 : 50;
}

function noteFromFrequency(frequency: number) {
  if (!Number.isFinite(frequency) || frequency < 70) return null;
  const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return chromatic[((midi % 12) + 12) % 12];
}

function estimatePitch(buffer: Float32Array, sampleRate: number) {
  const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
  if (rms < 0.015) return null;
  let bestScore = 0;
  let bestOffset = -1;
  for (let offset = 40; offset < 1000; offset += 1) {
    let score = 0;
    for (let index = 0; index < buffer.length - offset; index += 1) {
      score += 1 - Math.abs(buffer[index] - buffer[index + offset]);
    }
    score /= buffer.length - offset;
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return bestScore > 0.88 && bestOffset > 0 ? sampleRate / bestOffset : null;
}

function makeChallenge(stepNumber: number) {
  const today = new Date();
  const random = randomFor(Number(`${today.getFullYear()}${today.getMonth() + 1}${today.getDate()}${stepNumber}`));

  const first: [Note, Note] = [choose(random, ['B', 'C', 'D', 'E', 'F', 'G'] as Note[]), choose(random, ['C', 'D', 'E', 'F', 'G', 'A'] as Note[])];
  const differentIndex = Math.floor(random() * 2);
  const second: [Note, Note] = [...first];
  second[differentIndex] = choose(random, notes.filter((note) => note !== first[differentIndex]));

  const sing: [Note, Note] = [choose(random, ['C', 'D', 'E', 'F', 'G'] as Note[]), choose(random, ['C', 'D', 'E', 'F', 'G', 'A'] as Note[])];
  const piano: [Note, Note, Note] = [choose(random, notes), choose(random, notes), choose(random, notes)];

  const direction: Direction = random() > 0.5 ? 'asc' : 'desc';
  const low = choose(random, ['C', 'D', 'E', 'F'] as Note[]);
  const high = choose(random, ['G', 'A', 'B'] as Note[]);
  const interval: [Note, Note] = direction === 'asc' ? [low, high] : [high, low];

  const same = random() > 0.5;
  const seq1: [Note, Note, Note] = [choose(random, notes), choose(random, notes), choose(random, notes)];
  const seq2: [Note, Note, Note] = same ? [...seq1] : [...seq1];
  if (!same) {
    const index = Math.floor(random() * 3);
    seq2[index] = choose(random, notes.filter((note) => note !== seq1[index]));
  }

  return { first, second, differentIndex, sing, piano, direction, interval, seq1, seq2, same };
}

function SvgIcon({ type }: { type: 'note' | 'mic' | 'drum' | 'piano' | 'fork' | 'headphones' | 'volume' }) {
  if (type === 'volume') return <span className="svg-emoji">🔊</span>;
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      {type === 'note' && <path d="M40 9v34.5A11 11 0 1 1 34 34V17l22-5v10z" />}
      {type === 'mic' && <><rect x="23" y="8" width="18" height="32" rx="9" /><path d="M16 29c0 11 7 18 16 18s16-7 16-18M32 47v9M22 56h20" /></>}
      {type === 'drum' && <><ellipse cx="32" cy="24" rx="19" ry="8" /><path d="M13 24v17c0 5 8.5 9 19 9s19-4 19-9V24" /><path d="M17 10l10 12M47 10L37 22" /></>}
      {type === 'piano' && <><rect x="9" y="15" width="46" height="34" rx="4" /><path d="M18 16v32M27 16v32M37 16v32M46 16v32M22 16v19M41 16v19" /></>}
      {type === 'fork' && <><path d="M26 10v25c0 6-5 9-9 9M38 10v25c0 6 5 9 9 9M32 10v43" /><path d="M23 54h18" /></>}
      {type === 'headphones' && <><path d="M12 35V29a20 20 0 0 1 40 0v6" /><rect x="8" y="34" width="12" height="18" rx="4" /><rect x="44" y="34" width="12" height="18" rx="4" /></>}
    </svg>
  );
}

export function DailyEarTrainingFlowV6({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const audioRef = useRef<AudioContext | null>(null);
  const startedAt = useRef(Date.now());
  const rhythmStart = useRef(0);
  const marksRef = useRef<Mark[]>(Array(6).fill(null));

  const data = useMemo(() => makeChallenge(step.exerciseNumber), [step.exerciseNumber]);
  const [screen, setScreen] = useState<StepIndex>(0);
  const [marks, setMarks] = useState<Mark[]>(Array(6).fill(null));
  const [feedback, setFeedback] = useState<Mark>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const [differentChoice, setDifferentChoice] = useState<number | null>(null);
  const [voice, setVoice] = useState({ target: 0, heard: null as string | null, active: false, done: [] as boolean[] });
  const [beat, setBeat] = useState(-1);
  const [tapBeat, setTapBeat] = useState(-1);
  const [rhythmPhase, setRhythmPhase] = useState<'ready' | 'demo' | 'play' | 'done'>('ready');
  const [taps, setTaps] = useState(0);
  const [score, setScore] = useState<Score>({ perfect: 0, great: 0, good: 0, missed: 0 });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pianoAnswer, setPianoAnswer] = useState<Note[]>([]);
  const [draggingNote, setDraggingNote] = useState<Note | null>(null);
  const [directionChoice, setDirectionChoice] = useState<Direction | null>(null);
  const [sameChoice, setSameChoice] = useState<boolean | null>(null);
  const [cursor, setCursor] = useState<{ line: 1 | 2 | null; position: number }>({ line: null, position: 0 });

  const bpm = 77;
  const beatMs = Math.round(60000 / bpm);

  function getAudioContext() {
    if (!audioRef.current) audioRef.current = new AudioContext();
    return audioRef.current;
  }

  async function playTone(note: string, visual = false) {
    const ctx = getAudioContext();
    await ctx.resume().catch(() => null);
    const midi = toMidi(note);
    void preloadPianoSamples(ctx, [midi]);
    if (visual) {
      setActiveKey(note);
      window.setTimeout(() => setActiveKey(null), 260);
    }
    await playPianoSample(ctx, midi, ctx.currentTime + 0.025, ctx.currentTime + 0.6, 1.04);
    await wait(620);
  }

  async function playNotes(label: string, sequence: Note[], options?: { visual?: boolean; line?: 1 | 2 }) {
    if (playing) return;
    setPlaying(label);
    if (options?.line) setCursor({ line: options.line, position: 0 });
    for (let index = 0; index < sequence.length; index += 1) {
      if (options?.line) setCursor({ line: options.line, position: index });
      await playTone(sequence[index], Boolean(options?.visual));
      await wait(70);
    }
    if (options?.line) {
      setCursor({ line: options.line, position: 3 });
      await wait(200);
      setCursor({ line: null, position: 0 });
    }
    setPlaying(null);
  }

  async function kick() {
    const ctx = getAudioContext();
    await ctx.resume().catch(() => null);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(122, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(48, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.42, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.23);
  }

  function quit() {
    stopPianoSamples(audioRef.current ?? undefined);
    router.push('/aluno/central/diarios');
  }

  function persistSummary(finalMarks: Mark[]) {
    try {
      sessionStorage.setItem('daily-ear-training-summary', JSON.stringify({ exercise: step.exerciseNumber, marks: finalMarks, savedAt: Date.now() }));
    } catch {}
  }

  function finish(finalMarks = marksRef.current) {
    persistSummary(finalMarks);
    completeDailyStep(step, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
    stopPianoSamples(audioRef.current ?? undefined);
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  function mark(ok: boolean, next: (nextMarks: Mark[]) => void) {
    const nextMarks = [...marksRef.current];
    nextMarks[screen] = ok ? 'right' : 'wrong';
    marksRef.current = nextMarks;
    setMarks(nextMarks);
    setFeedback(ok ? 'right' : 'wrong');
    window.setTimeout(() => {
      setFeedback(null);
      next(nextMarks);
    }, 720);
  }

  async function listen(target: Note, index: number) {
    setVoice((old) => ({ ...old, target: index, heard: null, active: true }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      let okFrames = 0;
      const started = performance.now();
      while (performance.now() - started < 2200) {
        analyser.getFloatTimeDomainData(buffer);
        const current = noteFromFrequency(estimatePitch(buffer, ctx.sampleRate) || 0);
        setVoice((old) => ({ ...old, heard: current, active: true }));
        okFrames = current === target ? okFrames + 1 : Math.max(0, okFrames - 1);
        if (okFrames >= 5) break;
        await wait(90);
      }
      stream.getTracks().forEach((track) => track.stop());
      await ctx.close().catch(() => null);
      const ok = okFrames >= 5;
      setVoice((old) => {
        const done = [...old.done];
        done[index] = ok;
        return { ...old, active: false, done };
      });
      return ok;
    } catch {
      setVoice((old) => ({ ...old, active: false }));
      return false;
    }
  }

  async function runSing() {
    if (voice.active || playing) return;
    setVoice({ target: 0, heard: null, active: false, done: [] });
    await playNotes('sing-demo', data.sing);
    const results: boolean[] = [];
    for (let index = 0; index < data.sing.length; index += 1) {
      results[index] = await listen(data.sing[index], index);
      await wait(240);
    }
    mark(results.every(Boolean), () => setScreen(2));
  }

  async function demoRhythm() {
    if (rhythmPhase !== 'ready') return;
    setRhythmPhase('demo');
    setScore({ perfect: 0, great: 0, good: 0, missed: 0 });
    setTaps(0);
    for (let index = 0; index < 4; index += 1) {
      setBeat(index);
      await kick();
      await wait(beatMs);
    }
    setBeat(-1);
    await wait(340);
    setRhythmPhase('play');
    rhythmStart.current = performance.now() + 460;
  }

  function tapRhythm() {
    if (rhythmPhase !== 'play' || taps >= 4) return;
    void kick();
    const index = taps;
    setTapBeat(index);
    window.setTimeout(() => setTapBeat(-1), 170);
    const diff = Math.abs(performance.now() - (rhythmStart.current + index * beatMs));
    const quality: ScoreKey = diff <= 85 ? 'perfect' : diff <= 150 ? 'great' : diff <= 240 ? 'good' : 'missed';
    const nextScore = { ...score, [quality]: score[quality] + 1 };
    setScore(nextScore);
    const nextTap = index + 1;
    setTaps(nextTap);
    if (nextTap >= 4) {
      setRhythmPhase('done');
      window.setTimeout(() => mark(nextScore.missed < 3, () => setScreen(3)), 520);
    }
  }

  async function choosePiano(note: Note) {
    await playTone(note, true);
    if (pianoAnswer.length < 3) setPianoAnswer((old) => [...old, note]);
  }

  function placePiano(index: number) {
    if (!draggingNote) return;
    setPianoAnswer((old) => {
      const next = [...old];
      next[index] = draggingNote;
      return next.slice(0, 3) as Note[];
    });
    setDraggingNote(null);
  }

  return (
    <main className="ear6">
      <style>{styles}</style>
      <Header level={exercise.level} marks={marks} screen={screen} quit={quit} />

      {screen === 0 && (
        <StepOne
          data={data}
          selected={differentChoice}
          setSelected={setDifferentChoice}
          playing={playing}
          playSet={(kind) => playNotes(kind, kind === 'first' ? data.first : data.second)}
          submit={() => differentChoice !== null && mark(differentChoice === data.differentIndex, () => setScreen(1))}
        />
      )}
      {screen === 1 && <StepTwo data={data} voice={voice} run={runSing} />}
      {screen === 2 && <StepThree bpm={bpm} beat={beat} tapBeat={tapBeat} phase={rhythmPhase} score={score} demo={demoRhythm} tap={tapRhythm} />}
      {screen === 3 && (
        <StepFour
          answer={pianoAnswer}
          activeKey={activeKey}
          playing={playing === 'piano'}
          play={() => playNotes('piano', data.piano)}
          choose={choosePiano}
          setDragging={setDraggingNote}
          place={placePiano}
          reset={() => setPianoAnswer([])}
          submit={() => mark(pianoAnswer.length === 3 && pianoAnswer.join(',') === data.piano.join(','), () => setScreen(4))}
        />
      )}
      {screen === 4 && (
        <StepFive
          selected={directionChoice}
          setSelected={setDirectionChoice}
          playing={playing === 'interval'}
          play={() => playNotes('interval', data.interval)}
          submit={() => directionChoice && mark(directionChoice === data.direction, () => setScreen(5))}
        />
      )}
      {screen === 5 && (
        <StepSix
          selected={sameChoice}
          setSelected={setSameChoice}
          playing={playing}
          cursor={cursor}
          play1={() => playNotes('seq1', data.seq1, { line: 1 })}
          play2={() => playNotes('seq2', data.seq2, { line: 2 })}
          playBoth={async () => {
            await playNotes('seq1', data.seq1, { line: 1 });
            await wait(180);
            await playNotes('seq2', data.seq2, { line: 2 });
          }}
          submit={() => sameChoice !== null && mark(sameChoice === data.same, (finalMarks) => finish(finalMarks))}
        />
      )}

      {feedback && <div className={`ear-feedback ${feedback}`}>{feedback === 'right' ? '✓' : '×'}</div>}
    </main>
  );
}

function Header({ level, marks, screen, quit }: { level: string; marks: Mark[]; screen: StepIndex; quit: () => void }) {
  const items: Array<{ type: 'note' | 'mic' | 'drum' | 'piano' | 'fork' | 'headphones'; label: string }> = [
    { type: 'note', label: 'percepção' },
    { type: 'mic', label: 'voz' },
    { type: 'drum', label: 'ritmo' },
    { type: 'piano', label: 'piano' },
    { type: 'fork', label: 'direção' },
    { type: 'headphones', label: 'comparação' },
  ];
  return (
    <>
      <header className="ear-top"><button onClick={quit}>Sair</button><span>{level}</span><i>i</i></header>
      <nav className="ear-nav" aria-label="Etapas de percepção">
        {items.map((item, index) => (
          <span key={item.label} className={`${index === screen ? 'active' : ''} ${marks[index] ? 'marked' : ''} ${marks[index] === 'wrong' ? 'wrong' : ''}`}>
            <SvgIcon type={item.type} />
            <b>{marks[index] === 'wrong' ? '×' : '✓'}</b>
          </span>
        ))}
      </nav>
    </>
  );
}

function Medal() {
  return <div className="medal"><b>♛</b><span>◇</span></div>;
}

function TitleBlock({ children }: { children: ReactNode }) {
  return <section className="title-block"><Medal />{children}</section>;
}

function StepOne({ data, selected, setSelected, playing, playSet, submit }: { data: ReturnType<typeof makeChallenge>; selected: number | null; setSelected: (value: number) => void; playing: string | null; playSet: (kind: 'first' | 'second') => void; submit: () => void }) {
  return (
    <section className="exercise stage-one">
      <section className="intro-card">
        <Medal />
        <h1>Identifique dois conjuntos<br />de notas.</h1>
        <em />
        <p>Do <strong>2º</strong> conjunto, selecione<br />a nota que está fora do <strong>1º</strong> conjunto.</p>
      </section>
      <NoteSet title="1º CONJUNTO" playing={playing === 'first'} play={() => playSet('first')}>
        {data.first.map((note) => <NoteOption key={note} note={note} />)}
      </NoteSet>
      <NoteSet title="2º CONJUNTO" playing={playing === 'second'} play={() => playSet('second')}>
        {data.second.map((note, index) => (
          <button key={`${note}-${index}`} className={`note-answer ${selected === index ? 'selected' : ''}`} onClick={() => setSelected(index)}>
            <span>♪</span><i />
          </button>
        ))}
      </NoteSet>
      <ActionBar>{selected !== null && <button onClick={submit}>Enviar</button>}</ActionBar>
    </section>
  );
}

function NoteSet({ title, playing, play, children }: { title: string; playing: boolean; play: () => void; children: ReactNode }) {
  return <section className="note-set"><h2><span />{title}<span /></h2><button className={playing ? 'playing' : ''} onClick={play}><SvgIcon type="volume" /></button>{children}</section>;
}

function NoteOption({ note }: { note: Note }) {
  return <div className="note-option"><span>♪</span><b>{note}</b></div>;
}

function StepTwo({ data, voice, run }: { data: ReturnType<typeof makeChallenge>; voice: { target: number; heard: string | null; active: boolean; done: boolean[] }; run: () => void }) {
  return (
    <section className="exercise stage-two">
      <TitleBlock><h1>Ouça e cante<br />as mesmas notas</h1></TitleBlock>
      <div className="pitch-staff">
        {staffRows.map((row) => <div key={row}><span>{row}</span><i /></div>)}
        {data.sing.map((note, index) => <button key={`${note}-${index}`} className={voice.done[index] ? 'done' : ''} style={{ top: `${noteY(note)}%`, left: `${index ? 74 : 32}%` }}>{voice.done[index] ? '✓' : note}</button>)}
        {voice.heard && <em style={{ top: `${noteY(voice.heard)}%`, left: `${voice.target ? 74 : 32}%` }} />}
      </div>
      <button className="big-sound" onClick={run}><SvgIcon type="volume" /></button>
      <small>{voice.active ? 'centralize a bolinha' : 'toque e cante na sequência'}</small>
    </section>
  );
}

function StepThree({ bpm, beat, tapBeat, phase, score, demo, tap }: { bpm: number; beat: number; tapBeat: number; phase: string; score: Score; demo: () => void; tap: () => void }) {
  return (
    <section className="exercise stage-three">
      <TitleBlock><h1>Observe a bateria,<br />em seguida, toque seguindo o ritmo.</h1></TitleBlock>
      <div className="beat-row"><div>♩ = {bpm}<br /><small>4/4</small></div>{[0, 1, 2, 3].map((item) => <span key={item} className={beat === item || tapBeat === item ? 'on' : ''} />)}</div>
      <button className="tap-pad" onClick={tap} disabled={phase !== 'play'}><b>{phase === 'done' ? 'Concluído' : 'Toque aqui'}</b></button>
      <p className="score-line">Perfeito: <strong>{score.perfect}</strong> · Ótimo: <strong>{score.great}</strong> · Bom: <strong>{score.good}</strong><br />Perdido: <strong>{score.missed}</strong></p>
      <small>{phase === 'ready' || phase === 'demo' ? 'Demonstração...' : phase === 'play' ? 'Sua vez' : 'Avançando...'}</small>
      <button className="small-sound" onClick={demo} disabled={phase !== 'ready'}><SvgIcon type="volume" /></button>
    </section>
  );
}

function StepFour({ answer, activeKey, playing, play, choose, setDragging, place, reset, submit }: { answer: Note[]; activeKey: string | null; playing: boolean; play: () => void; choose: (note: Note) => void; setDragging: (note: Note) => void; place: (index: number) => void; reset: () => void; submit: () => void }) {
  return (
    <section className="exercise stage-four">
      <TitleBlock><h1>Ouça a(s) nota(s) de uma oitava inferior<br />ou superior.</h1><p>Encontre e selecione as mesmas notas no teclado.</p></TitleBlock>
      <Keyboard activeKey={activeKey} choose={choose} setDragging={setDragging} />
      <p className="hint">Pressione e segure o piano e arraste para a <strong>Área de Resposta...</strong></p>
      <div className="slots">{[0, 1, 2].map((index) => <button key={index} onDragOver={(event) => event.preventDefault()} onDrop={() => place(index)} onPointerUp={() => place(index)}>{answer[index] || ''}</button>)}</div>
      <button className={`big-sound ${playing ? 'playing' : ''}`} onClick={play}><SvgIcon type="volume" /></button>
      <ActionBar>{answer.length > 0 && <button className="ghost" onClick={reset}>Redefinir</button>}{answer.length === 3 && <button onClick={submit}>Enviar</button>}</ActionBar>
    </section>
  );
}

function Keyboard({ activeKey, choose, setDragging }: { activeKey: string | null; choose: (note: Note) => void; setDragging: (note: Note) => void }) {
  return (
    <div className="keyboard">
      {blackNotes.map((note, index) => <span key={note} className={`black b${index}`}>{note}</span>)}
      {notes.map((note) => <button key={note} draggable onDragStart={() => setDragging(note)} onPointerDown={() => setDragging(note)} onClick={() => choose(note)} className={activeKey === note ? 'on' : ''}><b>{note}</b></button>)}
    </div>
  );
}

function StepFive({ selected, setSelected, playing, play, submit }: { selected: Direction | null; setSelected: (value: Direction) => void; playing: boolean; play: () => void; submit: () => void }) {
  return (
    <section className="exercise stage-five">
      <TitleBlock><h1>Ouça as duas notas<br />Elas estão <strong>ascendentes</strong> ou <strong>descendentes</strong>?</h1></TitleBlock>
      <div className="interval-cards"><article><b>1st</b><span>♪</span></article><article><b>2nd</b><span>♪</span></article></div>
      <button className={`big-sound ${playing ? 'playing' : ''}`} onClick={play}><SvgIcon type="volume" /></button>
      <div className="choice-row"><button className={selected === 'asc' ? 'selected' : ''} onClick={() => setSelected('asc')}>Ascendente</button><button className={selected === 'desc' ? 'selected' : ''} onClick={() => setSelected('desc')}>Descendente</button></div>
      <ActionBar>{selected && <button onClick={submit}>Enviar</button>}</ActionBar>
    </section>
  );
}

function StepSix({ selected, setSelected, playing, cursor, play1, play2, playBoth, submit }: { selected: boolean | null; setSelected: (value: boolean) => void; playing: string | null; cursor: { line: 1 | 2 | null; position: number }; play1: () => void; play2: () => void; playBoth: () => void; submit: () => void }) {
  return (
    <section className="exercise stage-six">
      <TitleBlock><h1>Ouça dois conjuntos de notas.<br />São <strong>iguais</strong> ou <strong>diferentes</strong>?</h1></TitleBlock>
      <ScoreLine label="1st" active={playing === 'seq1'} play={play1} cursor={cursor} line={1} />
      <ScoreLine label="2nd" active={playing === 'seq2'} play={play2} cursor={cursor} line={2} />
      <button className={`big-sound ${playing ? 'playing' : ''}`} onClick={playBoth}><SvgIcon type="volume" /></button>
      <p className="select-label">Selecionar resposta</p>
      <div className="choice-row compare"><button className={selected === true ? 'selected' : ''} onClick={() => setSelected(true)}>Igual</button><button className={selected === false ? 'selected' : ''} onClick={() => setSelected(false)}>Diferente</button></div>
      <ActionBar>{selected !== null && <button onClick={submit}>Enviar</button>}</ActionBar>
    </section>
  );
}

function ScoreLine({ label, active, play, cursor, line }: { label: string; active: boolean; play: () => void; cursor: { line: 1 | 2 | null; position: number }; line: 1 | 2 }) {
  const left = cursor.line === line ? 16 + Math.min(cursor.position, 3) * 24 : 88;
  return <section className="score-card"><strong>{label}</strong><button className={active ? 'playing' : ''} onClick={play}><SvgIcon type="volume" /></button><div className="mini-staff"><i /><i /><i /><i /><i /><b style={{ left: `${left}%` }}>𝄞</b></div></section>;
}

function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>;
}

const styles = `
.ear6{--gold:#d7a34d;--gold2:#ffd482;min-height:100svh;background:radial-gradient(circle at 50% -8%,rgba(255,220,140,.12),transparent 24%),radial-gradient(circle at 50% 42%,rgba(215,163,77,.09),transparent 36%),linear-gradient(180deg,#17191b,#0b0d0f 62%,#050607);color:#f5eddf;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;text-align:center;padding:calc(14px + env(safe-area-inset-top)) 18px calc(16px + env(safe-area-inset-bottom));position:relative;overflow-x:hidden}.ear6:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(110deg,rgba(255,255,255,.018) 0 1px,transparent 1px 24px);pointer-events:none}.ear6 *{box-sizing:border-box}.ear6>*{position:relative;z-index:1}.ear-top{height:54px;width:min(100%,410px);display:grid;grid-template-columns:82px 1fr 42px;align-items:center;gap:10px;margin:0 auto}.ear-top button{height:36px;border:1.5px solid var(--gold);border-radius:999px;background:rgba(215,163,77,.04);color:var(--gold2);font:900 16px system-ui}.ear-top span{font-size:21px;letter-spacing:.16em;color:var(--gold2)}.ear-top i{width:40px;height:40px;border:1.5px solid var(--gold);border-radius:50%;display:grid;place-items:center;color:var(--gold2);font:900 23px Georgia,serif;font-style:italic}.ear-nav{height:70px;width:min(100%,410px);display:grid;grid-template-columns:repeat(6,1fr);align-items:center;gap:8px;margin:0 auto 6px}.ear-nav span{position:relative;display:grid;place-items:center;color:rgba(255,255,255,.42)}.ear-nav svg{width:31px;height:31px;fill:none;stroke:currentColor;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 10px rgba(255,255,255,.08))}.ear-nav .active{color:var(--gold2);text-shadow:0 0 24px rgba(255,212,130,.34)}.ear-nav .active:after{content:'';position:absolute;bottom:-7px;width:44px;height:2px;background:var(--gold2);box-shadow:0 0 16px rgba(255,212,130,.5)}.ear-nav b{display:none;position:absolute;bottom:-27px;font:900 22px system-ui;color:#22e66f}.ear-nav .marked b{display:block}.ear-nav .wrong b{color:#ff4141}.ear-nav .marked svg{opacity:.72}.exercise{width:min(100%,390px);min-height:calc(100svh - 150px - env(safe-area-inset-top) - env(safe-area-inset-bottom));margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;gap:12px;padding:16px 0 12px}.intro-card,.title-block{position:relative;width:min(100%,326px);border:1px solid rgba(215,163,77,.48);border-radius:25px;background:linear-gradient(145deg,rgba(215,163,77,.10),rgba(255,255,255,.018));box-shadow:0 0 34px rgba(215,163,77,.08);padding:34px 18px 17px}.title-block{border:0;background:transparent;box-shadow:none;padding:44px 6px 0}.medal{position:absolute;top:-24px;left:50%;transform:translateX(-50%);width:50px;height:50px;border:2px solid var(--gold2);border-radius:50%;display:grid;place-items:center;background:#151315;color:var(--gold2);box-shadow:0 0 25px rgba(215,163,77,.25)}.medal:before,.medal:after{content:'';position:absolute;top:50%;width:70px;height:1px;background:linear-gradient(90deg,transparent,rgba(215,163,77,.50))}.medal:before{right:100%}.medal:after{left:100%;transform:scaleX(-1)}.medal b{position:absolute;top:-18px;font-size:20px;font-family:serif}.medal span{font-size:24px}.title-block .medal{top:0}.intro-card h1,.title-block h1{font:900 clamp(18px,4.6vw,21px)/1.1 ui-monospace,SFMono-Regular,monospace;margin:0;letter-spacing:-.035em}.title-block h1{font-weight:700}.title-block p{font:400 clamp(13px,3.6vw,15px)/1.35 system-ui;margin:8px 0 0;color:rgba(255,255,255,.86)}.intro-card em{width:44px;height:2px;background:var(--gold2);display:block;margin:13px auto 11px}.intro-card p{margin:0;color:rgba(245,242,236,.66);font-size:clamp(12px,3.35vw,14px);line-height:1.25}.intro-card strong,.title-block strong,.hint strong{color:var(--gold2)}.note-set{position:relative;width:min(100%,342px);min-height:104px;border:1px solid rgba(215,163,77,.24);border-radius:21px;background:rgba(255,255,255,.018);display:grid;grid-template-columns:60px 1fr 1fr;align-items:center;gap:14px;padding:17px 18px 11px}.note-set h2{position:absolute;top:-13px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:48px auto 48px;gap:8px;align-items:center;color:var(--gold2);font-size:13px;font-weight:500;white-space:nowrap}.note-set h2 span{height:1px;background:rgba(215,163,77,.30)}.note-set>button,.big-sound,.small-sound,.score-card>button{display:grid;place-items:center;border:2px solid var(--gold2);border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.18),rgba(255,255,255,.018));color:var(--gold2);box-shadow:0 0 20px rgba(215,163,77,.20)}.note-set>button{width:52px;height:52px}.svg-emoji{font-size:26px;filter:saturate(.55)}.playing{transform:scale(.96);box-shadow:0 0 32px rgba(255,212,130,.42)!important}.note-option,.note-answer{border:0;background:transparent;color:#e8e8e8;display:grid;place-items:center}.note-option span,.note-answer span{font-size:31px;line-height:.72;color:var(--gold2)}.note-option b{margin-top:6px;font:800 18px system-ui}.note-answer i{display:block;width:24px;height:24px;border:2px solid rgba(255,255,255,.62);border-radius:50%;margin-top:8px}.note-answer.selected i{background:var(--gold2);box-shadow:0 0 18px rgba(255,212,130,.5)}.action-bar{min-height:44px;width:100%;display:flex;align-items:center;justify-content:center;gap:12px}.action-bar button{height:40px;min-width:120px;border:1px solid rgba(255,212,130,.75);border-radius:999px;background:linear-gradient(180deg,#ffe0a0,#d7a34d);color:#17110a;font:900 13px system-ui;text-transform:uppercase;letter-spacing:.04em}.action-bar .ghost{background:transparent;color:var(--gold2)}.pitch-staff{position:relative;width:min(100%,360px);height:min(39svh,342px);min-height:286px}.pitch-staff div{display:grid;grid-template-columns:36px 1fr;align-items:center;height:8.33%;color:rgba(255,255,255,.42);font:800 12px system-ui}.pitch-staff i{height:1px;background:rgba(255,255,255,.26)}.pitch-staff button{position:absolute;transform:translate(-50%,-50%);width:42px;height:42px;border:2px solid var(--gold2);border-radius:50%;background:rgba(0,0,0,.22);color:var(--gold2);font-weight:900}.pitch-staff button.done{border-color:#26e977;color:#26e977}.pitch-staff em{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;border:3px solid #fff;border-radius:50%;background:#f61717;box-shadow:0 0 18px rgba(246,23,23,.72)}.big-sound{width:60px;height:60px}.small-sound{width:54px;height:54px}small{font-size:13px;color:rgba(255,255,255,.54)}.beat-row{width:min(100%,360px);display:grid;grid-template-columns:66px repeat(4,1fr);gap:10px;align-items:center}.beat-row div{height:49px;border:1px solid rgba(215,163,77,.22);border-radius:14px;display:grid;place-items:center;color:var(--gold2);font-size:15px}.beat-row div small{font-size:17px;color:rgba(255,255,255,.55)}.beat-row span{width:22px;height:31px;border:1.7px solid var(--gold2);border-radius:3px;justify-self:center;position:relative}.beat-row span:after{content:'';position:absolute;inset:5px;border-radius:2px;background:rgba(255,212,130,.06)}.beat-row .on:after{background:linear-gradient(180deg,#ffdf99,#d7a34d);box-shadow:0 0 26px rgba(255,212,130,.72)}.tap-pad{width:min(100%,336px);height:min(18svh,154px);min-height:122px;border:1px solid rgba(215,163,77,.38);border-radius:21px;background:radial-gradient(circle at center,rgba(215,163,77,.18),rgba(255,255,255,.018) 34%,transparent);color:var(--gold2);font:400 20px system-ui}.tap-pad b{font-weight:400}.score-line{width:min(100%,336px);border:1px solid rgba(255,255,255,.08);border-radius:15px;margin:0;padding:8px;color:var(--gold2);font:400 13px/1.35 system-ui}.score-line strong{color:#fff;font-weight:400}.keyboard{position:relative;width:min(100%,350px);height:160px;border:1px solid rgba(215,163,77,.32);border-radius:20px;padding:39px 10px 17px;display:grid;grid-template-columns:repeat(7,1fr);background:rgba(255,255,255,.015);box-shadow:0 0 28px rgba(215,163,77,.08)}.keyboard>button{border:1px solid rgba(0,0,0,.45);background:linear-gradient(90deg,#ede8da,#fffaf0 45%,#d4cdbf);color:#282828;font:900 18px system-ui;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px}.keyboard>button.on,.keyboard>button:active{transform:translateY(3px);filter:brightness(.86);box-shadow:inset 0 8px 20px rgba(0,0,0,.24),0 0 28px rgba(215,163,77,.42)}.black{position:absolute;top:28px;width:33px;height:81px;background:linear-gradient(180deg,#000,#1e1e1e 70%,#4b4b4b);color:var(--gold2);font:900 12px system-ui;padding-top:7px;border-radius:0 0 6px 6px;z-index:3}.b0{left:17%}.b1{left:29%}.b2{left:55%}.b3{left:67%}.b4{left:79%}.hint{margin:0;width:min(100%,340px);font:400 13px/1.35 system-ui;color:rgba(255,255,255,.75)}.slots{display:flex;gap:18px}.slots button{width:52px;height:52px;border:2px dashed var(--gold2);border-radius:50%;background:rgba(215,163,77,.03);color:#fff;font:900 21px system-ui}.interval-cards{width:min(100%,350px);display:grid;grid-template-columns:1fr 1fr;gap:14px}.interval-cards article{height:132px;border:1px solid rgba(215,163,77,.48);border-radius:22px;background:radial-gradient(circle at 50% 60%,rgba(215,163,77,.13),rgba(255,255,255,.015));display:grid;place-items:center;color:var(--gold2)}.interval-cards b{font:800 22px system-ui}.interval-cards span{font-size:52px;text-shadow:0 0 22px rgba(215,163,77,.34)}.choice-row{display:flex;justify-content:center;gap:12px}.choice-row button{min-width:132px;min-height:42px;border:1px solid rgba(215,163,77,.58);border-radius:999px;background:rgba(215,163,77,.055);color:var(--gold2);font:900 12px system-ui;text-transform:uppercase;letter-spacing:.04em;padding:10px 12px}.choice-row button.selected{background:var(--gold2);color:#17110a}.score-card{position:relative;width:min(100%,350px);height:76px;border:1px solid rgba(215,163,77,.30);border-radius:17px;background:rgba(255,255,255,.015);display:grid;grid-template-columns:56px 1fr;align-items:center;padding:9px 14px;margin-top:14px}.score-card strong{position:absolute;top:-25px;left:14px;color:var(--gold2);font:800 21px system-ui}.score-card>button{width:48px;height:48px}.mini-staff{position:relative;height:46px}.mini-staff i{position:absolute;left:0;right:0;height:1px;background:rgba(215,163,77,.45)}.mini-staff i:nth-child(1){top:7px}.mini-staff i:nth-child(2){top:15px}.mini-staff i:nth-child(3){top:23px}.mini-staff i:nth-child(4){top:31px}.mini-staff i:nth-child(5){top:39px}.mini-staff b{position:absolute;top:-5px;color:var(--gold2);font-size:39px;line-height:1;transition:left .55s ease;text-shadow:0 0 18px rgba(215,163,77,.45)}.select-label{margin:0;color:var(--gold2);font-size:15px}.ear-feedback{position:fixed;inset:0;display:grid;place-items:center;z-index:20;background:rgba(0,0,0,.22);backdrop-filter:blur(2px);font:950 72px system-ui;color:#25ef78;text-shadow:0 0 34px rgba(37,239,120,.7)}.ear-feedback.wrong{color:#ff4242;text-shadow:0 0 34px rgba(255,66,66,.7)}@media(max-height:740px){.ear6{padding-top:calc(10px + env(safe-area-inset-top))}.ear-top{height:48px}.ear-nav{height:62px;margin-bottom:2px}.exercise{min-height:calc(100svh - 132px - env(safe-area-inset-top) - env(safe-area-inset-bottom));gap:8px;padding-top:12px}.intro-card{min-height:134px;padding-top:28px}.note-set{min-height:94px}.title-block{padding-top:36px}.pitch-staff{height:34svh;min-height:248px}.tap-pad{min-height:106px;max-height:128px}.keyboard{height:144px}.black{height:74px}.interval-cards article{height:112px}.big-sound{width:54px;height:54px}.small-sound{width:50px;height:50px}.score-card{height:68px}.choice-row button{min-height:38px}.action-bar{min-height:40px}.action-bar button{height:38px}}`;
