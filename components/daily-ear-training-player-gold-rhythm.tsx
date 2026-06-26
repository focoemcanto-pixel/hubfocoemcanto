'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type Phase = 'ready' | 'demo' | 'armed' | 'play' | 'done';
type Quality = 'perfect' | 'great' | 'good' | 'missed' | null;
type Pulse = 'idle' | 'count' | 'demo' | 'hit' | 'miss';
type Score = { perfect: number; great: number; good: number; missed: number };

const icons = ['♪', '▥', '◉', '▰', '♮', '◖'];
const bpm = 77;
const beatMs = Math.round(60000 / bpm);
const rhythmPattern = [true, false, true, false, false];
const totalSlots = rhythmPattern.length;

function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function emptyPulses(): Pulse[] { return rhythmPattern.map(() => 'idle'); }

export function DailyEarTrainingPlayerGoldRhythm({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const started = useRef(Date.now());
  const audioRef = useRef<AudioContext | null>(null);
  const userStartRef = useRef(0);
  const activeRef = useRef(false);
  const expectedRef = useRef(0);
  const scoreRef = useRef<Score>({ perfect: 0, great: 0, good: 0, missed: 0 });
  const [phase, setPhase] = useState<Phase>('ready');
  const [pulses, setPulses] = useState<Pulse[]>(emptyPulses());
  const [tapCount, setTapCount] = useState(0);
  const [quality, setQuality] = useState<Quality>(null);
  const [score, setScoreState] = useState<Score>(scoreRef.current);

  function setScore(next: Score) { scoreRef.current = next; setScoreState(next); }
  function quit() { router.push('/aluno/central/diarios'); }
  function ctx() { if (!audioRef.current) audioRef.current = new AudioContext(); return audioRef.current; }
  function markPulse(index: number, value: Pulse) { setPulses((old) => old.map((item, current) => current === index ? value : item)); }
  function clearPulses() { setPulses(emptyPulses()); setQuality(null); }

  function noiseBurst(at: number, duration: number, gainValue: number, highpass = 3500) {
    const context = ctx();
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(gainValue, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(at);
    source.stop(at + duration + 0.03);
  }

  function kickAt(at: number, velocity = 1) {
    const context = ctx();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(122, at);
    osc.frequency.exponentialRampToValueAtTime(48, at + 0.16);
    gain.gain.setValueAtTime(0.42 * velocity, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(gain).connect(context.destination);
    osc.start(at);
    osc.stop(at + 0.23);
  }

  function snareAt(at: number) { noiseBurst(at, 0.09, 0.16, 1200); }
  function hatAt(at: number) { noiseBurst(at, 0.034, 0.055, 5600); }

  function grooveTick(slot: number, at: number) {
    hatAt(at);
    if (slot === 0) kickAt(at, 1.05);
    if (slot === 2) snareAt(at);
    if (slot === 3) kickAt(at, 0.64);
  }

  async function startDemo() {
    if (phase === 'demo') return;
    const context = ctx();
    await context.resume().catch(() => null);
    setPhase('demo');
    setTapCount(0);
    setScore({ perfect: 0, great: 0, good: 0, missed: 0 });
    clearPulses();

    // contagem inicial: áudio/tempo existe, mas a notação permanece vazia.
    for (let i = 0; i < totalSlots; i += 1) {
      grooveTick(i, context.currentTime + 0.01);
      await wait(beatMs);
    }

    // demonstração: só os pulsos que devem ser tocados sobem e acendem branco.
    clearPulses();
    for (let i = 0; i < totalSlots; i += 1) {
      grooveTick(i, context.currentTime + 0.01);
      if (rhythmPattern[i]) {
        markPulse(i, 'demo');
        await wait(Math.min(220, beatMs * 0.42));
        markPulse(i, 'idle');
        await wait(Math.max(0, beatMs - Math.min(220, beatMs * 0.42)));
      } else {
        await wait(beatMs);
      }
    }

    clearPulses();
    setPhase('armed');
  }

  function startUserTurn() {
    if (phase !== 'armed') return;
    const context = ctx();
    clearPulses();
    setTapCount(0);
    setScore({ perfect: 0, great: 0, good: 0, missed: 0 });
    activeRef.current = true;
    expectedRef.current = 0;
    userStartRef.current = performance.now() + 260;
    setPhase('play');

    for (let i = 0; i < totalSlots; i += 1) {
      window.setTimeout(() => {
        grooveTick(i, context.currentTime + 0.01);
        if (!rhythmPattern[i]) return;
        const index = i;
        window.setTimeout(() => {
          if (activeRef.current && pulses[index] !== 'hit') {
            markPulse(index, 'miss');
            const next = { ...scoreRef.current, missed: scoreRef.current.missed + 1 };
            setScore(next);
            setQuality('missed');
          }
        }, Math.round(beatMs * 0.34));
      }, 260 + i * beatMs);
    }

    window.setTimeout(() => finish(), 260 + totalSlots * beatMs + 420);
  }

  function tap() {
    if (phase === 'armed') { startUserTurn(); return; }
    if (phase !== 'play' || !activeRef.current) return;
    const expectedSlots = rhythmPattern.map((active, index) => active ? index : -1).filter((index) => index >= 0);
    const expectedSlot = expectedSlots[expectedRef.current] ?? expectedSlots[expectedSlots.length - 1];
    const targetTime = userStartRef.current + expectedSlot * beatMs;
    const diff = Math.abs(performance.now() - targetTime);
    const nextQuality: Exclude<Quality, null> = diff <= 90 ? 'perfect' : diff <= 155 ? 'great' : diff <= 245 ? 'good' : 'missed';
    const ok = nextQuality !== 'missed';
    kickAt(ctx().currentTime + 0.01, ok ? 0.9 : 0.55);
    markPulse(expectedSlot, ok ? 'hit' : 'miss');
    setQuality(nextQuality);
    setScore({ ...scoreRef.current, [nextQuality]: scoreRef.current[nextQuality] + 1 });
    setTapCount((old) => old + 1);
    expectedRef.current = Math.min(expectedRef.current + 1, expectedSlots.length);
  }

  function finish() {
    if (!activeRef.current) return;
    activeRef.current = false;
    setPhase('done');
    window.setTimeout(() => {
      completeDailyStep(step, Math.max(1, Math.round((Date.now() - started.current) / 1000)));
      router.push('/aluno/central/diarios');
    }, 1250);
  }

  return (
    <main className="rhythm-gold">
      <style>{css}</style>
      <header className="top"><button onClick={quit}>Sair</button><span>{exercise.level}</span><i>i</i></header>
      <nav className="steps">{icons.map((icon, index) => <span key={icon} className={`${index === 2 ? 'active' : ''} ${index < 2 ? 'done' : ''}`}>{icon}<b>✓</b></span>)}</nav>

      <section className="title-card"><div className="medal"><b>♛</b><span>◇</span></div><h1>Observe a bateria,<br />em seguida, toque seguindo o ritmo.</h1></section>

      <section className="beat-line">
        <div className="bpm">♩ = {bpm}<br /><small>{totalSlots}/8</small></div>
        {pulses.map((item, index) => <i key={index} className={`${item} ${rhythmPattern[index] ? 'target' : 'rest'}`} />)}
      </section>

      <button className={`tap-zone ${quality || ''} ${phase}`} onClick={tap} disabled={phase === 'ready' || phase === 'demo' || phase === 'done'}>
        <span>{phase === 'armed' ? <>Prepare-se<br />Toque para começar!</> : phase === 'done' ? 'Concluído' : 'Toque aqui'}</span>
      </button>

      <section className="score"><span>Perfeito: <b>{score.perfect}</b></span><em>|</em><span>Ótimo: <b>{score.great}</b></span><em>|</em><span>Bom: <b>{score.good}</b></span><br /><span>Perdido: <b>{score.missed}</b></span></section>
      <p>{phase === 'ready' ? 'Ouça a demonstração...' : phase === 'demo' ? 'Demonstração...' : phase === 'armed' ? 'Agora toque no centro...' : phase === 'play' ? `${tapCount} toque(s)` : 'Finalizando...'}</p>
      <button className={`demo ${phase === 'demo' ? 'playing' : ''}`} onClick={startDemo} disabled={phase === 'demo' || phase === 'play'}>🔊</button>
    </main>
  );
}

const css = `.rhythm-gold{--gold:#d7a34d;--gold2:#ffd482;min-height:100dvh;overflow:hidden;position:relative;padding:56px 64px;color:#f5efe2;background:radial-gradient(circle at 50% -8%,rgba(255,220,140,.12),transparent 26%),radial-gradient(circle at 50% 52%,rgba(215,163,77,.08),transparent 34%),linear-gradient(180deg,#17191b,#0d0f11 58%,#07080a);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;text-align:center}.rhythm-gold:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(110deg,rgba(255,255,255,.018) 0 1px,transparent 1px 24px);opacity:.7}.rhythm-gold>*{position:relative;z-index:1}.top{display:grid;grid-template-columns:142px 1fr 72px;align-items:center}.top button{width:142px;height:68px;border:2px solid var(--gold);border-radius:999px;background:rgba(215,163,77,.035);color:var(--gold2);font:900 29px system-ui}.top span{color:var(--gold2);font-size:34px;letter-spacing:.19em}.top i{width:72px;height:72px;border:2px solid var(--gold);border-radius:50%;display:grid;place-items:center;color:var(--gold2);font:900 42px system-ui;font-style:italic}.steps{margin:72px auto 0;display:grid;grid-template-columns:repeat(6,1fr);gap:72px;max-width:740px}.steps span{height:64px;display:grid;place-items:center;color:rgba(255,255,255,.42);font-size:50px;position:relative;filter:grayscale(1)}.steps .active{color:var(--gold2);filter:none;text-shadow:0 0 24px rgba(215,163,77,.45)}.steps .active:after{content:'';position:absolute;left:50%;bottom:-24px;width:88px;height:2px;transform:translateX(-50%);background:var(--gold2)}.steps b{display:none}.steps .done b{display:block;position:absolute;bottom:-36px;color:var(--gold2);font-size:42px}.title-card{position:relative;margin:96px auto 38px;padding-top:106px}.medal{position:absolute;top:0;left:50%;transform:translateX(-50%);width:94px;height:94px;border:3px solid var(--gold2);border-radius:50%;display:grid;place-items:center;background:#171516;color:var(--gold2);box-shadow:0 0 34px rgba(215,163,77,.25)}.medal:before,.medal:after{content:'';position:absolute;top:50%;width:190px;height:1px;background:linear-gradient(90deg,transparent,rgba(215,163,77,.55))}.medal:before{right:100%}.medal:after{left:100%;transform:scaleX(-1)}.medal b{position:absolute;top:-31px;font-size:36px;font-family:serif}.medal span{font-size:46px}.title-card h1{font:400 31px/1.28 system-ui;color:rgba(255,255,255,.92);margin:0}.beat-line{width:min(780px,84vw);margin:0 auto 32px;display:grid;grid-template-columns:174px repeat(5,1fr);gap:44px;align-items:center}.bpm{height:112px;border:1px solid rgba(215,163,77,.2);border-radius:25px;display:grid;place-items:center;color:var(--gold2);font-size:35px;background:rgba(255,255,255,.018)}.bpm small{font-size:36px}.beat-line i{width:39px;height:57px;border:2px solid rgba(255,255,255,.36);border-radius:3px;justify-self:center;position:relative;background:rgba(255,255,255,.015);transition:transform .14s ease,background .12s ease,box-shadow .12s ease,border-color .12s ease}.beat-line i.rest{opacity:.42}.beat-line i:after{content:'';position:absolute;left:0;right:0;top:74px;height:53px;background:linear-gradient(180deg,rgba(255,255,255,.20),transparent);filter:blur(3px);opacity:.18}.beat-line i.demo,.beat-line i.hit{transform:translateY(-18px);background:#fff;border-color:#fff;box-shadow:0 0 32px rgba(255,255,255,.92),0 0 22px rgba(255,212,130,.72)}.beat-line i.miss{transform:translateY(-18px);background:#f20f0f;border-color:#ffb0b0;box-shadow:0 0 32px rgba(255,30,30,.72)}.beat-line i.count{background:rgba(255,255,255,.16)}.tap-zone{width:min(780px,84vw);height:336px;border:1.5px solid rgba(255,255,255,.58);border-radius:34px;background:radial-gradient(circle at 50% 52%,rgba(255,255,255,.18),rgba(255,255,255,.07) 26%,rgba(255,255,255,.025));box-shadow:inset 0 0 56px rgba(255,255,255,.04),0 0 38px rgba(0,0,0,.26);color:#fff;font:400 32px system-ui}.tap-zone span{display:grid;place-items:center;margin:auto;width:190px;height:190px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.22),rgba(255,255,255,.06) 60%,transparent)}.tap-zone.armed{box-shadow:0 0 30px rgba(255,255,255,.25),inset 0 0 62px rgba(255,255,255,.08)}.tap-zone.perfect,.tap-zone.great,.tap-zone.good{background:radial-gradient(circle at 50% 52%,rgba(255,255,255,.28),rgba(255,255,255,.10) 34%,rgba(255,255,255,.025));box-shadow:0 0 50px rgba(255,255,255,.32),inset 0 0 62px rgba(255,255,255,.14)}.tap-zone.missed{background:rgba(245,0,0,.86);box-shadow:0 0 46px rgba(255,0,0,.45),inset 0 0 62px rgba(255,255,255,.10)}.score{width:min(700px,76vw);min-height:96px;border:1px solid rgba(255,255,255,.08);border-radius:24px;margin:48px auto 28px;padding:19px 22px;color:#fff;font-size:28px;line-height:1.52;background:rgba(0,0,0,.12)}.score b{color:#fff;font-weight:400}.score em{font-style:normal;margin:0 22px;color:rgba(255,255,255,.72)}p{font:400 29px system-ui;color:rgba(255,255,255,.34);margin:0 0 22px}.demo{width:104px;height:104px;border:3px solid #fff;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.16),rgba(255,255,255,.02));font-size:38px;color:#fff;box-shadow:0 0 30px rgba(255,255,255,.22)}.demo.playing{transform:scale(.96);box-shadow:0 0 48px rgba(255,255,255,.46)}@media(max-width:640px){.rhythm-gold{padding:44px 38px}.top{grid-template-columns:112px 1fr 60px}.top button{width:112px;height:56px;font-size:24px}.top span{font-size:28px}.top i{width:60px;height:60px;font-size:36px}.steps{gap:34px;margin-top:54px}.steps span{font-size:38px}.title-card{margin-top:74px;margin-bottom:36px}.title-card h1{font-size:24px}.beat-line{grid-template-columns:112px repeat(5,1fr);gap:22px}.bpm{height:92px;font-size:28px}.bpm small{font-size:28px}.beat-line i{width:28px;height:43px}.tap-zone{height:270px}.score{font-size:22px;margin-top:34px}.score em{margin:0 10px}p{font-size:23px}.demo{width:90px;height:90px}}`;
