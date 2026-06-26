'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type NoteName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
type Status = 'idle' | 'right' | 'wrong';

type Challenge = {
  first: NoteName[];
  second: NoteName[];
  answerIndex: number;
};

const notes: NoteName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function seeded(seedValue: number) {
  let seed = seedValue || 1;
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function createChallenge(stepNumber: number): Challenge {
  const now = new Date();
  const seed = Number(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${stepNumber}`);
  const rand = seeded(seed);
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length) % items.length];
  const first: NoteName[] = [pick(['B', 'C', 'D', 'E', 'F', 'G'] as NoteName[]), pick(['C', 'D', 'E', 'F', 'G', 'A'] as NoteName[])];
  const answerIndex = Math.floor(rand() * 2);
  const second: NoteName[] = [...first];
  second[answerIndex] = pick(notes.filter((note) => note !== first[answerIndex]));
  return { first, second, answerIndex };
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function noteMidi(note: NoteName) {
  return noteNameToMidi(`${note}4`) ?? 60;
}

export function DailyEarTrainingPlayerGold({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const audioRef = useRef<AudioContext | null>(null);
  const startedAt = useRef(Date.now());
  const challenge = useMemo(() => createChallenge(step.exerciseNumber), [step.exerciseNumber]);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [playing, setPlaying] = useState<'first' | 'second' | null>(null);

  function getAudioContext() {
    if (!audioRef.current) {
      const Ctor = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      audioRef.current = Ctor ? new Ctor() : null;
    }
    return audioRef.current;
  }

  async function playNote(note: NoteName) {
    const context = getAudioContext();
    if (!context) return;
    await context.resume().catch(() => null);
    const midi = noteMidi(note);
    void preloadPianoSamples(context, [midi]);
    await playPianoSample(context, midi, context.currentTime + 0.025, context.currentTime + 0.62, 1.06);
    await sleep(680);
  }

  async function playSet(kind: 'first' | 'second') {
    setPlaying(kind);
    const target = kind === 'first' ? challenge.first : challenge.second;
    const context = getAudioContext();
    if (context) void preloadPianoSamples(context, target.map(noteMidi));
    for (const note of target) await playNote(note);
    await sleep(120);
    setPlaying(null);
  }

  function submit() {
    if (selected == null) return;
    const ok = selected === challenge.answerIndex;
    setStatus(ok ? 'right' : 'wrong');
    window.setTimeout(() => {
      completeDailyStep(step, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
      stopPianoSamples(audioRef.current ?? undefined);
      router.push('/aluno/central/diarios');
    }, 980);
  }

  function quit() {
    stopPianoSamples(audioRef.current ?? undefined);
    router.push('/aluno/central/diarios');
  }

  return (
    <main className="gold-ear-screen">
      <style>{css}</style>
      <header className="gold-ear-top">
        <button type="button" onClick={quit}>Sair</button>
        <span>{exercise.level}</span>
        <i>i</i>
      </header>

      <nav className="gold-ear-icons" aria-label="Etapas da percepção">
        {['♪', '▥', '◎', '▰', '♮', '◖'].map((icon, index) => (
          <span key={index} className={index === 0 ? 'active' : ''}>{icon}</span>
        ))}
      </nav>

      <section className="gold-ear-intro">
        <div className="gold-ear-medal"><b>♛</b><span>◇</span></div>
        <h1>Identifique dois conjuntos<br />de notas.</h1>
        <em />
        <p>Do <strong>2º</strong> conjunto, selecione<br />a nota que está fora do<br /><strong>1º</strong> conjunto.</p>
      </section>

      <section className="gold-set-card first-set">
        <h2><span />1º CONJUNTO<span /></h2>
        <div className="gold-set-content">
          <button type="button" className={`gold-play ${playing === 'first' ? 'playing' : ''}`} onClick={() => playSet('first')}>🔊</button>
          {challenge.first.map((note, index) => (
            <div className="gold-note" key={`${note}-${index}`}><span>♪</span><b>{note}</b></div>
          ))}
        </div>
      </section>

      <section className="gold-set-card second-set">
        <h2><span />2º CONJUNTO<span /></h2>
        <div className="gold-set-content">
          <button type="button" className={`gold-play ${playing === 'second' ? 'playing' : ''}`} onClick={() => playSet('second')}>🔊</button>
          {challenge.second.map((note, index) => (
            <button type="button" className={`gold-answer ${selected === index ? 'selected' : ''}`} key={`${note}-${index}`} onClick={() => setSelected(index)}>
              <span>♪</span><i />
            </button>
          ))}
        </div>
      </section>

      {selected != null ? <button type="button" className="gold-send" onClick={submit}>Enviar</button> : null}
      {status !== 'idle' ? <div className={`gold-feedback ${status}`}>{status === 'right' ? '✓' : '×'}</div> : null}
    </main>
  );
}

const css = `.gold-ear-screen{--gold:#d7a34d;--gold-2:#ffd482;--muted:#8b8b8d;--line:rgba(215,163,77,.35);min-height:100dvh;overflow:hidden;position:relative;padding:56px 64px 54px;color:#f7f1e5;background:radial-gradient(circle at 50% -8%,rgba(255,220,140,.12),transparent 26%),radial-gradient(circle at 50% 34%,rgba(217,163,77,.08),transparent 34%),radial-gradient(circle at 18% 72%,rgba(255,255,255,.04),transparent 24%),linear-gradient(180deg,#17191b,#0d0f11 56%,#07080a);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace}.gold-ear-screen:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(110deg,rgba(255,255,255,.018) 0 1px,transparent 1px 24px),radial-gradient(circle at 50% 52%,rgba(255,255,255,.055),transparent 22%);opacity:.6;pointer-events:none}.gold-ear-screen>*{position:relative;z-index:1}.gold-ear-top{display:grid;grid-template-columns:142px 1fr 72px;align-items:center}.gold-ear-top button{width:142px;height:68px;border:2px solid var(--gold);border-radius:999px;background:rgba(215,163,77,.035);color:var(--gold-2);font:900 29px system-ui,sans-serif;letter-spacing:.02em;box-shadow:0 0 28px rgba(215,163,77,.11),inset 0 0 18px rgba(215,163,77,.04)}.gold-ear-top span{text-align:center;color:var(--gold-2);font-size:34px;letter-spacing:.19em;text-shadow:0 0 20px rgba(215,163,77,.22)}.gold-ear-top i{width:72px;height:72px;border:2px solid var(--gold);border-radius:50%;display:grid;place-items:center;color:var(--gold-2);font:900 42px system-ui,sans-serif;font-style:normal;box-shadow:0 0 26px rgba(215,163,77,.11)}.gold-ear-icons{margin:72px auto 0;display:grid;grid-template-columns:repeat(6,1fr);gap:72px;align-items:center;max-width:740px}.gold-ear-icons span{height:64px;display:grid;place-items:center;color:rgba(255,255,255,.42);font-size:50px;position:relative;filter:grayscale(1)}.gold-ear-icons span.active{color:var(--gold-2);filter:none;text-shadow:0 0 22px rgba(215,163,77,.35)}.gold-ear-icons span.active:after{content:'';position:absolute;left:50%;bottom:-24px;transform:translateX(-50%);width:88px;height:2px;background:var(--gold-2);box-shadow:0 0 14px rgba(215,163,77,.36)}.gold-ear-intro{width:min(500px,70vw);height:332px;margin:118px auto 82px;border:1.5px solid rgba(215,163,77,.58);border-radius:44px;background:linear-gradient(145deg,rgba(215,163,77,.11),rgba(255,255,255,.018) 40%,rgba(0,0,0,.04));box-shadow:0 0 54px rgba(215,163,77,.11),inset 0 0 55px rgba(215,163,77,.035);display:grid;place-items:center;text-align:center;padding:78px 56px 48px}.gold-ear-medal{position:absolute;top:-45px;left:50%;transform:translateX(-50%);width:94px;height:94px;border:3px solid var(--gold-2);border-radius:50%;display:grid;place-items:center;background:#171516;color:var(--gold-2);box-shadow:0 0 34px rgba(215,163,77,.25)}.gold-ear-medal b{position:absolute;top:-31px;font-size:36px;line-height:1;color:var(--gold-2);font-family:serif}.gold-ear-medal span{font-size:46px;line-height:1}.gold-ear-intro h1{font:900 29px/1.18 ui-monospace,SFMono-Regular,monospace;color:#f5f2ec;margin:0;text-shadow:0 2px 4px rgba(0,0,0,.25)}.gold-ear-intro em{width:62px;height:2px;background:var(--gold-2);display:block;margin:27px 0 23px;box-shadow:0 0 14px rgba(215,163,77,.35)}.gold-ear-intro p{margin:0;color:rgba(245,242,236,.68);font-size:22px;line-height:1.38}.gold-ear-intro strong{color:var(--gold-2);font-weight:700}.gold-set-card{width:min(564px,76vw);height:218px;margin:0 auto 78px;border:1px solid rgba(215,163,77,.21);border-radius:34px;background:rgba(255,255,255,.018);box-shadow:inset 0 0 34px rgba(255,255,255,.015),0 0 34px rgba(0,0,0,.2);padding:38px 44px 32px}.gold-set-card h2{position:absolute;top:-22px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:80px auto 80px;align-items:center;gap:17px;color:var(--gold-2);font-size:22px;font-weight:500;letter-spacing:.08em;white-space:nowrap;margin:0}.gold-set-card h2 span{height:1px;background:rgba(215,163,77,.25);position:relative}.gold-set-card h2 span:after{content:'';position:absolute;right:-3px;top:-2px;width:5px;height:5px;border-radius:50%;background:var(--gold-2)}.gold-set-card h2 span:last-child:after{right:auto;left:-3px}.gold-set-content{height:100%;display:grid;grid-template-columns:120px 1fr 1fr;gap:54px;align-items:center}.gold-play{width:124px;height:124px;border:3px solid var(--gold-2);border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.16),rgba(255,255,255,.02));font-size:46px;color:#fff;box-shadow:0 0 30px rgba(215,163,77,.22),inset 0 0 30px rgba(215,163,77,.05);transition:.2s ease}.gold-play.playing{transform:scale(.96);box-shadow:0 0 48px rgba(215,163,77,.46),inset 0 0 34px rgba(215,163,77,.13)}.gold-note,.gold-answer{display:grid;place-items:center;border:0;background:transparent;text-align:center;color:#e8e8e8}.gold-note span,.gold-answer span{font-size:62px;line-height:.78;color:var(--gold-2);text-shadow:0 0 18px rgba(215,163,77,.22)}.gold-note b{margin-top:10px;font:700 31px system-ui,sans-serif;color:#e9e9e9}.gold-answer i{width:46px;height:46px;border:3px solid rgba(255,255,255,.64);border-radius:50%;margin-top:16px;display:block;transition:.18s ease}.gold-answer.selected i{background:var(--gold-2);border-color:var(--gold-2);box-shadow:0 0 28px rgba(215,163,77,.52)}.gold-answer.selected span{filter:drop-shadow(0 0 14px rgba(215,163,77,.42))}.gold-send{position:absolute;right:60px;bottom:46px;border:1.5px solid rgba(215,163,77,.7);border-radius:999px;background:rgba(215,163,77,.08);color:var(--gold-2);font:800 25px system-ui,sans-serif;padding:15px 30px;box-shadow:0 0 24px rgba(215,163,77,.12)}.gold-feedback{position:absolute;inset:0;display:grid;place-items:center;font:950 120px system-ui,sans-serif;z-index:8;background:rgba(0,0,0,.28);backdrop-filter:blur(4px)}.gold-feedback.right{color:#10df73;text-shadow:0 0 34px rgba(16,223,115,.5)}.gold-feedback.wrong{color:#ff3030;text-shadow:0 0 34px rgba(255,48,48,.5)}@media(max-width:640px){.gold-ear-screen{padding:44px 38px 46px}.gold-ear-top{grid-template-columns:112px 1fr 60px}.gold-ear-top button{width:112px;height:56px;font-size:24px}.gold-ear-top span{font-size:28px}.gold-ear-top i{width:60px;height:60px;font-size:36px}.gold-ear-icons{gap:34px;margin-top:54px}.gold-ear-icons span{font-size:38px}.gold-ear-intro{width:min(500px,76vw);height:300px;margin-top:104px;margin-bottom:72px;padding:70px 34px 40px}.gold-ear-intro h1{font-size:25px}.gold-ear-intro p{font-size:19px}.gold-set-card{width:min(564px,78vw);height:194px;margin-bottom:70px;padding:34px 34px 28px}.gold-set-content{grid-template-columns:98px 1fr 1fr;gap:38px}.gold-play{width:98px;height:98px;font-size:38px}.gold-note span,.gold-answer span{font-size:52px}.gold-note b{font-size:27px}.gold-answer i{width:38px;height:38px}.gold-send{right:38px;bottom:36px}}`;
