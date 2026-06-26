'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeDailyStep } from '@/lib/daily-training-progress';
import type { DailyTrainingStep, TrainingExercise } from '@/lib/training-center';

type Phase = 'ready' | 'demo' | 'play' | 'done';
type Quality = 'perfect' | 'great' | 'good' | 'missed' | null;

type Score = { perfect: number; great: number; good: number; missed: number };

const icons = ['♪', '▥', '◉', '▰', '♮', '◖'];
const bpm = 77;
const beatMs = Math.round(60000 / bpm);

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function DailyEarTrainingPlayerGoldRhythm({ step, exercise }: { step: DailyTrainingStep; exercise: TrainingExercise }) {
  const router = useRouter();
  const started = useRef(Date.now());
  const audioRef = useRef<AudioContext | null>(null);
  const startRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [beat, setBeat] = useState(-1);
  const [tapCount, setTapCount] = useState(0);
  const [quality, setQuality] = useState<Quality>(null);
  const [score, setScore] = useState<Score>({ perfect: 0, great: 0, good: 0, missed: 0 });

  function quit() {
    router.push('/aluno/central/diarios');
  }

  function ctx() {
    if (!audioRef.current) audioRef.current = new AudioContext();
    return audioRef.current;
  }

  async function kick() {
    const context = ctx();
    await context.resume().catch(() => null);
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(122, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(48, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.42, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.23);
  }

  async function startDemo() {
    if (phase !== 'ready') return;
    setPhase('demo');
    setScore({ perfect: 0, great: 0, good: 0, missed: 0 });
    setTapCount(0);
    setQuality(null);

    for (let i = 0; i < 4; i += 1) {
      setBeat(i);
      await kick();
      await wait(beatMs);
    }

    setBeat(-1);
    await wait(420);
    setPhase('play');
    startRef.current = performance.now() + 520;

    for (let i = 0; i < 4; i += 1) window.setTimeout(() => setBeat(i), 520 + i * beatMs);
    window.setTimeout(() => setBeat(-1), 520 + 4 * beatMs);
  }

  function tap() {
    if (phase !== 'play' || tapCount >= 4) return;
    void kick();
    const diff = Math.abs(performance.now() - (startRef.current + tapCount * beatMs));
    const nextQuality: Exclude<Quality, null> = diff <= 85 ? 'perfect' : diff <= 150 ? 'great' : diff <= 240 ? 'good' : 'missed';
    setQuality(nextQuality);
    setScore((old) => ({ ...old, [nextQuality]: old[nextQuality] + 1 }));
    const nextTap = tapCount + 1;
    setTapCount(nextTap);
    if (nextTap >= 4) {
      setPhase('done');
      window.setTimeout(() => {
        completeDailyStep(step, Math.max(1, Math.round((Date.now() - started.current) / 1000)));
        router.push('/aluno/central/diarios');
      }, 1200);
    }
  }

  return (
    <main className="rhythm-gold">
      <style>{css}</style>
      <header className="top"><button onClick={quit}>Sair</button><span>{exercise.level}</span><i>i</i></header>
      <nav className="steps">{icons.map((icon, index) => <span key={icon} className={`${index === 2 ? 'active' : ''} ${index < 2 ? 'done' : ''}`}>{icon}<b>✓</b></span>)}</nav>

      <section className="title-card">
        <div className="medal"><b>♛</b><span>◇</span></div>
        <h1>Observe a bateria,<br />em seguida, toque seguindo o ritmo.</h1>
      </section>

      <section className="beat-line">
        <div className="bpm">♩ = {bpm}<br /><small>4/4</small></div>
        {[0, 1, 2, 3].map((item) => <i key={item} className={beat === item ? 'on' : ''} />)}
      </section>

      <button className={`tap-zone ${quality || ''}`} onClick={tap} disabled={phase !== 'play'}><span>{phase === 'done' ? 'Concluído' : 'Toque aqui'}</span></button>

      <section className="score">
        <span>Perfeito: <b>{score.perfect}</b></span><em>|</em><span>Ótimo: <b>{score.great}</b></span><em>|</em><span>Bom: <b>{score.good}</b></span><br />
        <span>Perdido: <b>{score.missed}</b></span>
      </section>

      <p>{phase === 'ready' || phase === 'demo' ? 'Demonstração...' : phase === 'play' ? 'Sua vez' : 'Finalizando...'}</p>
      <button className={`demo ${phase === 'demo' ? 'playing' : ''}`} onClick={startDemo} disabled={phase !== 'ready'}>🔊</button>
    </main>
  );
}

const css = `.rhythm-gold{--gold:#d7a34d;--gold2:#ffd482;min-height:100dvh;overflow:hidden;position:relative;padding:56px 64px;color:#f5efe2;background:radial-gradient(circle at 50% -8%,rgba(255,220,140,.12),transparent 26%),radial-gradient(circle at 50% 52%,rgba(215,163,77,.08),transparent 34%),linear-gradient(180deg,#17191b,#0d0f11 58%,#07080a);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;text-align:center}.rhythm-gold:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(110deg,rgba(255,255,255,.018) 0 1px,transparent 1px 24px);opacity:.7}.rhythm-gold>*{position:relative;z-index:1}.top{display:grid;grid-template-columns:142px 1fr 72px;align-items:center}.top button{width:142px;height:68px;border:2px solid var(--gold);border-radius:999px;background:rgba(215,163,77,.035);color:var(--gold2);font:900 29px system-ui}.top span{color:var(--gold2);font-size:34px;letter-spacing:.19em}.top i{width:72px;height:72px;border:2px solid var(--gold);border-radius:50%;display:grid;place-items:center;color:var(--gold2);font:900 42px system-ui;font-style:normal}.steps{margin:72px auto 0;display:grid;grid-template-columns:repeat(6,1fr);gap:72px;max-width:740px}.steps span{height:64px;display:grid;place-items:center;color:rgba(255,255,255,.42);font-size:50px;position:relative;filter:grayscale(1)}.steps .active{color:var(--gold2);filter:none;text-shadow:0 0 24px rgba(215,163,77,.45)}.steps .active:after{content:'';position:absolute;left:50%;bottom:-24px;width:88px;height:2px;transform:translateX(-50%);background:var(--gold2)}.steps b{display:none}.steps .done b{display:block;position:absolute;bottom:-36px;color:var(--gold2);font-size:42px}.title-card{position:relative;margin:116px auto 60px;padding-top:112px}.medal{position:absolute;top:0;left:50%;transform:translateX(-50%);width:94px;height:94px;border:3px solid var(--gold2);border-radius:50%;display:grid;place-items:center;background:#171516;color:var(--gold2);box-shadow:0 0 34px rgba(215,163,77,.25)}.medal:before,.medal:after{content:'';position:absolute;top:50%;width:190px;height:1px;background:linear-gradient(90deg,transparent,rgba(215,163,77,.55))}.medal:before{right:100%}.medal:after{left:100%;transform:scaleX(-1)}.medal b{position:absolute;top:-31px;font-size:36px;font-family:serif}.medal span{font-size:46px}.title-card h1{font:400 31px/1.28 system-ui;color:rgba(255,255,255,.92);margin:0}.beat-line{width:min(780px,84vw);margin:0 auto 32px;display:grid;grid-template-columns:174px repeat(4,1fr);gap:54px;align-items:center}.bpm{height:132px;border:1px solid rgba(215,163,77,.2);border-radius:25px;display:grid;place-items:center;color:var(--gold2);font-size:39px;background:rgba(255,255,255,.018)}.bpm small{font-size:40px}.beat-line i{width:39px;height:57px;border:2px solid var(--gold2);border-radius:3px;justify-self:center;position:relative}.beat-line i:after{content:'';position:absolute;left:0;right:0;top:74px;height:53px;background:linear-gradient(180deg,rgba(215,163,77,.22),transparent);filter:blur(3px)}.beat-line i.on{background:linear-gradient(180deg,#ffdc91,#d7a34d);box-shadow:0 0 38px rgba(255,212,130,.55)}.tap-zone{width:min(780px,84vw);height:336px;border:1.5px solid rgba(215,163,77,.42);border-radius:34px;background:radial-gradient(circle at 50% 52%,rgba(215,163,77,.18),rgba(255,255,255,.02) 26%,rgba(255,255,255,.012));box-shadow:inset 0 0 56px rgba(215,163,77,.03),0 0 38px rgba(0,0,0,.26);color:var(--gold2);font:400 32px system-ui}.tap-zone span{display:grid;place-items:center;margin:auto;width:190px;height:190px;border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.24),rgba(215,163,77,.05) 60%,transparent)}.tap-zone.perfect,.tap-zone.great{box-shadow:0 0 48px rgba(255,212,130,.34),inset 0 0 62px rgba(215,163,77,.11)}.tap-zone.missed{box-shadow:0 0 38px rgba(255,64,64,.25),inset 0 0 62px rgba(255,64,64,.06)}.score{width:min(700px,76vw);min-height:96px;border:1px solid rgba(255,255,255,.08);border-radius:24px;margin:48px auto 28px;padding:19px 22px;color:var(--gold2);font-size:28px;line-height:1.52;background:rgba(0,0,0,.12)}.score b{color:#fff;font-weight:400}.score em{font-style:normal;margin:0 22px;color:rgba(255,255,255,.72)}p{font:400 29px system-ui;color:rgba(215,163,77,.36);margin:0 0 22px}.demo{width:104px;height:104px;border:3px solid var(--gold2);border-radius:50%;background:radial-gradient(circle,rgba(215,163,77,.16),rgba(255,255,255,.02));font-size:38px;color:#fff;box-shadow:0 0 30px rgba(215,163,77,.22)}.demo.playing{transform:scale(.96);box-shadow:0 0 48px rgba(215,163,77,.46)}@media(max-width:640px){.rhythm-gold{padding:44px 38px}.top{grid-template-columns:112px 1fr 60px}.top button{width:112px;height:56px;font-size:24px}.top span{font-size:28px}.top i{width:60px;height:60px;font-size:36px}.steps{gap:34px;margin-top:54px}.steps span{font-size:38px}.title-card{margin-top:78px;margin-bottom:52px}.title-card h1{font-size:24px}.beat-line{grid-template-columns:120px repeat(4,1fr);gap:25px}.bpm{height:96px;font-size:30px}.bpm small{font-size:31px}.beat-line i{width:31px;height:47px}.tap-zone{height:290px}.score{font-size:22px}.score em{margin:0 10px}p{font-size:24px}}`;
