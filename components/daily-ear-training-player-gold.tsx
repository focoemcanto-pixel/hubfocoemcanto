'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import { noteNameToMidi } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type NoteName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
type Status = 'idle' | 'right' | 'wrong';
type Challenge = { first: NoteName[]; second: NoteName[]; answerIndex: number };

const notes: NoteName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const stepIcons = ['♪', '▥', '◎', '▰', '♮', '◖'];

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

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function noteMidi(note: NoteName) { return noteNameToMidi(`${note}4`) ?? 60; }

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
    await sleep(660);
  }

  async function playSet(kind: 'first' | 'second') {
    setPlaying(kind);
    const target = kind === 'first' ? challenge.first : challenge.second;
    const context = getAudioContext();
    if (context) void preloadPianoSamples(context, target.map(noteMidi));
    for (const note of target) await playNote(note);
    await sleep(100);
    setPlaying(null);
  }

  function goDone() {
    completeDailyStep(step, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
    stopPianoSamples(audioRef.current ?? undefined);
    router.push(`/aluno/central/diarios/concluido?exercicio=${step.exerciseNumber}`);
  }

  function submit() {
    if (selected == null) return;
    setStatus(selected === challenge.answerIndex ? 'right' : 'wrong');
    window.setTimeout(goDone, 760);
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
        {stepIcons.map((icon, index) => <span key={icon} className={index === 0 ? 'active' : ''}>{icon}</span>)}
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
          <button type="button" className={`gold-play ${playing === 'first' ? 'playing' : ''}`} onClick={() => playSet('first')} aria-label="Tocar primeiro conjunto">🔊</button>
          {challenge.first.map((note, index) => <div className="gold-note" key={`${note}-${index}`}><span>♪</span><b>{note}</b></div>)}
        </div>
      </section>

      <section className="gold-set-card second-set">
        <h2><span />2º CONJUNTO<span /></h2>
        <div className="gold-set-content">
          <button type="button" className={`gold-play ${playing === 'second' ? 'playing' : ''}`} onClick={() => playSet('second')} aria-label="Tocar segundo conjunto">🔊</button>
          {challenge.second.map((note, index) => (
            <button type="button" className={`gold-answer ${selected === index ? 'selected' : ''}`} key={`${note}-${index}`} onClick={() => setSelected(index)} aria-label={`Selecionar nota ${index + 1}`}>
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

const css = `.gold-ear-screen{--gold:#d7a34d;--gold2:#ffd482;--paper:#f6f2ea;min-height:100dvh;position:relative;overflow-y:auto;overflow-x:hidden;padding:calc(34px + env(safe-area-inset-top)) 22px calc(36px + env(safe-area-inset-bottom));color:var(--paper);background:radial-gradient(circle at 50% -8%,rgba(255,219,142,.12),transparent 25%),radial-gradient(circle at 50% 34%,rgba(215,163,77,.09),transparent 36%),linear-gradient(180deg,#181a1b,#0d0f10 58%,#060708);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;text-align:center}.gold-ear-screen:before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(110deg,rgba(255,255,255,.018) 0 1px,transparent 1px 24px),radial-gradient(circle at 50% 52%,rgba(255,255,255,.052),transparent 24%);opacity:.75;pointer-events:none}.gold-ear-screen>*{position:relative;z-index:1}.gold-ear-top{width:min(100%,430px);margin:0 auto;display:grid;grid-template-columns:104px 1fr 54px;align-items:center;gap:12px}.gold-ear-top button{width:104px;height:52px;border:1.5px solid var(--gold);border-radius:999px;background:rgba(215,163,77,.035);color:var(--gold2);font:900 23px system-ui,sans-serif;letter-spacing:.01em;box-shadow:0 0 20px rgba(215,163,77,.10),inset 0 0 14px rgba(215,163,77,.04)}.gold-ear-top span{text-align:center;color:var(--gold2);font-size:25px;letter-spacing:.18em;text-shadow:0 0 18px rgba(215,163,77,.20)}.gold-ear-top i{width:54px;height:54px;border:1.5px solid var(--gold);border-radius:50%;display:grid;place-items:center;color:var(--gold2);font:900 31px system-ui,sans-serif;font-style:normal;box-shadow:0 0 20px rgba(215,163,77,.10)}.gold-ear-icons{width:min(100%,430px);margin:48px auto 0;display:grid;grid-template-columns:repeat(6,1fr);gap:18px;align-items:center}.gold-ear-icons span{height:48px;display:grid;place-items:center;color:rgba(255,255,255,.38);font-size:35px;position:relative;filter:grayscale(1)}.gold-ear-icons span.active{color:var(--gold2);filter:none;text-shadow:0 0 18px rgba(215,163,77,.34)}.gold-ear-icons span.active:after{content:'';position:absolute;left:50%;bottom:-16px;transform:translateX(-50%);width:70px;height:2px;background:var(--gold2);box-shadow:0 0 12px rgba(215,163,77,.36)}.gold-ear-intro{width:min(100%,330px);min-height:238px;margin:82px auto 58px;border:1.2px solid rgba(215,163,77,.58);border-radius:34px;background:linear-gradient(145deg,rgba(215,163,77,.105),rgba(255,255,255,.018) 42%,rgba(0,0,0,.05));box-shadow:0 0 42px rgba(215,163,77,.10),inset 0 0 48px rgba(215,163,77,.028);display:grid;place-items:center;text-align:center;padding:62px 30px 34px}.gold-ear-medal{position:absolute;top:-38px;left:50%;transform:translateX(-50%);width:78px;height:78px;border:2.4px solid var(--gold2);border-radius:50%;display:grid;place-items:center;background:#171516;color:var(--gold2);box-shadow:0 0 26px rgba(215,163,77,.22)}.gold-ear-medal b{position:absolute;top:-25px;font-size:29px;line-height:1;color:var(--gold2);font-family:serif}.gold-ear-medal span{font-size:36px;line-height:1}.gold-ear-intro h1{font:900 24px/1.18 ui-monospace,SFMono-Regular,monospace;color:#f5f2ec;margin:0;text-shadow:0 2px 4px rgba(0,0,0,.25)}.gold-ear-intro em{width:52px;height:2px;background:var(--gold2);display:block;margin:22px 0 18px;box-shadow:0 0 12px rgba(215,163,77,.35)}.gold-ear-intro p{margin:0;color:rgba(245,242,236,.66);font-size:18px;line-height:1.42}.gold-ear-intro strong{color:var(--gold2);font-weight:800}.gold-set-card{width:min(100%,352px);height:auto;margin:0 auto 48px;border:1px solid rgba(215,163,77,.22);border-radius:27px;background:rgba(255,255,255,.017);box-shadow:inset 0 0 30px rgba(255,255,255,.012),0 0 26px rgba(0,0,0,.22);padding:32px 28px 26px}.gold-set-card h2{position:absolute;top:-16px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:62px auto 62px;align-items:center;gap:12px;color:var(--gold2);font-size:18px;font-weight:500;letter-spacing:.08em;white-space:nowrap;margin:0}.gold-set-card h2 span{height:1px;background:rgba(215,163,77,.28);position:relative}.gold-set-card h2 span:after{content:'';position:absolute;right:-3px;top:-2px;width:5px;height:5px;border-radius:50%;background:var(--gold2)}.gold-set-card h2 span:last-child:after{right:auto;left:-3px}.gold-set-content{display:grid;grid-template-columns:82px 1fr 1fr;gap:26px;align-items:center}.gold-play{width:82px;height:82px;border:2px solid var(--gold2);border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.17),rgba(255,255,255,.02));font-size:35px;color:#fff;box-shadow:0 0 24px rgba(215,163,77,.20),inset 0 0 24px rgba(215,163,77,.05);transition:.2s ease}.gold-play.playing{transform:scale(.96);box-shadow:0 0 38px rgba(215,163,77,.44),inset 0 0 30px rgba(215,163,77,.12)}.gold-note,.gold-answer{display:grid;place-items:center;border:0;background:transparent;text-align:center;color:#e8e8e8;min-height:92px}.gold-note span,.gold-answer span{font-size:48px;line-height:.78;color:var(--gold2);text-shadow:0 0 16px rgba(215,163,77,.20)}.gold-note b{margin-top:10px;font:700 25px system-ui,sans-serif;color:#e9e9e9}.gold-answer i{width:35px;height:35px;border:2px solid rgba(255,255,255,.65);border-radius:50%;margin-top:14px;display:block;transition:.18s ease}.gold-answer.selected i{background:var(--gold2);border-color:var(--gold2);box-shadow:0 0 24px rgba(215,163,77,.48)}.gold-send{position:fixed;right:22px;bottom:calc(24px + env(safe-area-inset-bottom));border:0;border-radius:999px;background:linear-gradient(180deg,#ffe0a0,#d7a34d);color:#16110a;font:900 16px system-ui,sans-serif;text-transform:uppercase;padding:14px 22px;box-shadow:0 18px 40px rgba(0,0,0,.34),0 0 22px rgba(215,163,77,.25);z-index:8}.gold-feedback{position:fixed;inset:0;display:grid;place-items:center;font-size:88px;font-weight:950;color:#43ff83;text-shadow:0 0 34px rgba(67,255,131,.72);background:rgba(0,0,0,.18);z-index:10;pointer-events:none}.gold-feedback.wrong{color:#ff4242;text-shadow:0 0 34px rgba(255,66,66,.72)}@media(min-width:720px){.gold-ear-screen{padding-top:58px}.gold-ear-top,.gold-ear-icons{width:min(760px,82vw)}.gold-ear-icons{gap:52px;margin-top:64px}.gold-ear-icons span{font-size:48px}.gold-ear-intro{width:500px;min-height:330px;margin-top:112px;margin-bottom:78px;padding:78px 56px 48px}.gold-ear-medal{width:94px;height:94px;top:-45px}.gold-ear-medal b{top:-31px;font-size:36px}.gold-ear-medal span{font-size:46px}.gold-ear-intro h1{font-size:29px}.gold-ear-intro p{font-size:22px}.gold-set-card{width:564px;margin-bottom:76px;padding:38px 44px 32px;border-radius:34px}.gold-set-content{grid-template-columns:120px 1fr 1fr;gap:54px}.gold-play{width:124px;height:124px;font-size:46px}.gold-note span,.gold-answer span{font-size:62px}.gold-note b{font-size:31px}.gold-answer i{width:46px;height:46px}.gold-send{right:60px;bottom:44px;font-size:20px}}@media(max-height:760px) and (max-width:640px){.gold-ear-top{grid-template-columns:92px 1fr 50px}.gold-ear-top button{width:92px;height:46px;font-size:20px}.gold-ear-top span{font-size:22px}.gold-ear-top i{width:50px;height:50px;font-size:28px}.gold-ear-icons{margin-top:34px}.gold-ear-icons span{font-size:30px}.gold-ear-intro{margin-top:68px;margin-bottom:42px;min-height:210px;padding:56px 26px 30px}.gold-ear-intro h1{font-size:22px}.gold-ear-intro p{font-size:16px}.gold-set-card{margin-bottom:36px;padding:30px 24px 22px}.gold-set-content{grid-template-columns:74px 1fr 1fr;gap:20px}.gold-play{width:74px;height:74px;font-size:31px}.gold-note span,.gold-answer span{font-size:43px}.gold-note b{font-size:22px}.gold-answer i{width:31px;height:31px}}`;
