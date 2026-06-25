'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise, TrainingNote } from '@/lib/training-center';
import { getTrainingDurationSeconds } from '@/lib/training-center';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PLAYHEAD = 12;
const TARGET_SPEED = 15;
const MIN_PITCH = 'C0';
const MAX_PITCH = 'G7';
const PITCHES = Array.from({ length: 8 }, (_, octave) => NAMES.map((note) => `${note}${octave}`))
  .flat()
  .filter((pitch) => {
    const value = midi(pitch);
    return value !== null && value >= midi(MIN_PITCH)! && value <= midi(MAX_PITCH)!;
  });

type AudioCtor = typeof AudioContext;
type WinAudio = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type Tuner = { frequency: number | null; stableFrequency: number | null; cents: number | null; feedback: string };
type Vars = CSSProperties & { '--voice-y': string; '--voice-opacity': string; '--progress': string };

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function midi(pitch?: string) {
  const match = pitch?.match(/^([A-G])(#?)(\d)$/);
  if (!match) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (Number(match[3]) + 1) * 12 + base[match[1]] + (match[2] ? 1 : 0);
}
function frequencyFromPitch(pitch?: string) {
  const value = midi(pitch);
  return value === null ? null : 440 * 2 ** ((value - 69) / 12);
}
function yFromMidi(value: number | null) {
  if (value === null) return 60;
  const min = midi(MIN_PITCH)!;
  const max = midi(MAX_PITCH)!;
  return clamp(97 - ((value - min) / (max - min)) * 94, 2, 97);
}
function yFromPitch(pitch?: string) { return yFromMidi(midi(pitch)); }
function yFromFrequency(freq: number | null) { return freq ? yFromMidi(69 + 12 * Math.log2(freq / 440)) : null; }
function fmt(time: number) { const total = Math.max(0, Math.floor(time)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; }
function detectPitch(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] ** 2;
  if (Math.sqrt(rms / buffer.length) < 0.008) return null;
  let best = 0;
  let bestOffset = -1;
  for (let offset = Math.floor(sampleRate / 900); offset <= Math.floor(sampleRate / 65); offset += 1) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - offset; i += 1) correlation += buffer[i] * buffer[i + offset];
    correlation /= buffer.length - offset;
    if (correlation > best) { best = correlation; bestOffset = offset; }
  }
  return bestOffset > 0 && best > 0.0012 ? sampleRate / bestOffset : null;
}

export function GuidedTrainingPlayer({ exercise }: { exercise: TrainingExercise; compact?: boolean }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [loop, setLoop] = useState(true);
  const [metro, setMetro] = useState(true);
  const [mic, setMic] = useState(false);
  const [tuner, setTuner] = useState<Tuner>({ frequency: null, stableFrequency: null, cents: null, feedback: 'Toque em iniciar e permita o microfone' });

  const audioContextRef = useRef<AudioContext | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const micRafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const smoothFreqRef = useRef<number | null>(null);
  const silenceRef = useRef(0);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const timersRef = useRef<number[]>([]);
  const targetRef = useRef<number | null>(null);

  const duration = useMemo(() => getTrainingDurationSeconds(exercise), [exercise]);
  const activeNote = exercise.notes.find((note) => time >= note.start && time <= note.start + note.duration);
  const activePitch = activeNote?.pitch || '—';
  targetRef.current = frequencyFromPitch(activeNote?.pitch);

  const capturedY = yFromFrequency(tuner.stableFrequency);
  const hasSignal = capturedY !== null;
  const progress = Math.min(100, (time / duration) * 100);
  const cssVars = { '--voice-y': `${capturedY ?? 50}%`, '--voice-opacity': hasSignal ? '1' : '0', '--progress': String(progress) } as Vars;

  useEffect(() => () => { stopAudio(); stopMic(); }, []);
  useEffect(() => {
    if (!playing) return;
    lastFrameRef.current = null;
    const tick = (now: number) => {
      if (lastFrameRef.current === null) lastFrameRef.current = now;
      const delta = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      setTime((old) => {
        const next = old + delta;
        if (next >= duration) {
          if (!loop) { setPlaying(false); stopAudio(); return duration; }
          stopAudio();
          startSound(0);
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, duration, loop, metro]);

  function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioContextRef.current) {
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      audioContextRef.current = Ctor ? new Ctor() : null;
    }
    return audioContextRef.current;
  }

  function stopAudio() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    oscillatorsRef.current.forEach((osc) => { try { osc.stop(); } catch {} });
    oscillatorsRef.current = [];
    setCount(null);
  }

  function playClick(context: AudioContext, at: number, strong = false) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'square';
    osc.frequency.value = strong ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.22 : 0.14, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(gain); gain.connect(context.destination);
    osc.start(at); osc.stop(at + 0.08);
    oscillatorsRef.current.push(osc);
  }

  function playPiano(context: AudioContext, frequency: number, at: number, end: number) {
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    filter.connect(master); master.connect(context.destination);
    master.gain.setValueAtTime(0.0001, at);
    master.gain.exponentialRampToValueAtTime(0.32, at + 0.01);
    master.gain.exponentialRampToValueAtTime(0.11, at + 0.22);
    master.gain.exponentialRampToValueAtTime(0.0001, end);
    [1, 2, 3].forEach((ratio) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = ratio === 1 ? 'triangle' : 'sine';
      osc.frequency.value = frequency * ratio;
      gain.gain.value = ratio === 1 ? 0.75 : ratio === 2 ? 0.2 : 0.08;
      osc.connect(gain); gain.connect(filter);
      osc.start(at); osc.stop(end + 0.04);
      oscillatorsRef.current.push(osc);
    });
  }

  function startSound(from: number) {
    const context = getAudioContext();
    if (!context) return;
    context.resume().catch(() => null);
    const now = context.currentTime + 0.025;
    const beat = 60 / exercise.bpm;
    if (metro) {
      for (let b = Math.ceil(from / beat); b * beat <= duration; b += 1) {
        const beatTime = b * beat;
        playClick(context, now + Math.max(0, beatTime - from), b % 4 === 0);
      }
    }
    exercise.notes.forEach((note) => {
      const frequency = frequencyFromPitch(note.pitch);
      if (!frequency || note.start + note.duration <= from) return;
      playPiano(context, frequency, now + Math.max(0, note.start - from), now + Math.max(0.18, note.start + note.duration - from));
    });
  }

  async function play() {
    if (playing || count) { stopAudio(); setPlaying(false); return; }
    await startMic();
    const context = getAudioContext();
    if (!context) { setPlaying(true); return; }
    context.resume().catch(() => null);
    stopAudio();
    const beatMs = (60 / exercise.bpm) * 1000;
    [4, 3, 2, 1].forEach((value, index) => {
      timersRef.current.push(window.setTimeout(() => { setCount(value); playClick(context, context.currentTime + 0.01, value === 4); }, index * beatMs));
    });
    timersRef.current.push(window.setTimeout(() => {
      setCount(null);
      const start = time >= duration ? 0 : time;
      setTime(start);
      startSound(start);
      setPlaying(true);
    }, 4 * beatMs));
  }

  async function startMic() {
    if (mic || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const context = new Ctor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      micContextRef.current = context;
      streamRef.current = stream;
      setMic(true);
      listen(analyser, context);
    } catch {
      setTuner({ frequency: null, stableFrequency: null, cents: null, feedback: 'Permita o microfone' });
    }
  }

  function stopMic() {
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    micContextRef.current?.close().catch(() => null);
    streamRef.current = null;
    micContextRef.current = null;
    setMic(false);
  }

  function listen(analyser: AnalyserNode, context: AudioContext) {
    const buffer = new Float32Array(analyser.fftSize);
    const loopPitch = () => {
      analyser.getFloatTimeDomainData(buffer);
      const raw = detectPitch(buffer, context.sampleRate);
      const target = targetRef.current;
      if (!raw) {
        silenceRef.current += 1;
        if (silenceRef.current > 10) {
          smoothFreqRef.current = null;
          setTuner((old) => ({ ...old, frequency: null, stableFrequency: null, cents: null, feedback: 'Cante próximo ao microfone' }));
        }
      } else {
        silenceRef.current = 0;
        smoothFreqRef.current = smoothFreqRef.current === null ? raw : smoothFreqRef.current * 0.45 + raw * 0.55;
        const stable = smoothFreqRef.current;
        if (!target) setTuner({ frequency: raw, stableFrequency: stable, cents: null, feedback: 'Aguardando nota' });
        else {
          const cents = 1200 * Math.log2(stable / target);
          setTuner({ frequency: raw, stableFrequency: stable, cents, feedback: Math.abs(cents) <= 28 ? 'Perfeito!' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' });
        }
      }
      micRafRef.current = requestAnimationFrame(loopPitch);
    };
    loopPitch();
  }

  function getTargetStyle(note: TrainingNote): CSSProperties | null {
    const noteEnd = note.start + note.duration;
    const left = PLAYHEAD + (note.start - time) * TARGET_SPEED;
    const width = Math.max(5, note.duration * TARGET_SPEED);
    if (left + width < -8 || left > 115) return null;
    return { left: `${left}%`, width: `${width}%`, top: `${yFromPitch(note.pitch)}%` };
  }

  return <section className="premium-workout" style={cssVars}>
    <style>{css}</style>
    {count ? <div className="count-in"><b>{count}</b><span>prepare a entrada</span></div> : null}
    <header className="player-head"><div><strong>Relaxation with Vocal Fry</strong></div></header>
    <div className="time-row"><span>{fmt(time)}</span><i><b style={{ width: `${progress}%` }} /></i><span>{fmt(duration)}</span><strong>♩ {exercise.bpm} BPM</strong></div>
    <main className="stage">
      <div className="ruler">{PITCHES.slice().reverse().map((p) => <span className={p === activePitch ? 'active' : p === 'C4' || p === 'G3' || p.endsWith('0') ? 'key' : ''} key={p}>{p}</span>)}</div>
      <div className="body" aria-hidden="true"><img src="/images/vocal-silhouette.svg" alt="" draggable={false} /></div>
      <div className="register-notes" aria-hidden="true"><span>Seu Registro de<br />Alcance Vocal...</span><span>‹ Heady / Light</span><span>‹ Mixy / Balanced</span><span>‹ Chesty / Heavy</span></div>
      <div className="voice-marker"><i /></div>
      <div className="target-lane">{exercise.notes.map((note, index) => { const style = getTargetStyle(note); return style ? <span className="target" key={`${note.pitch}-${index}`} style={style} /> : null; })}</div>
      <div className="status-line">{tuner.feedback}</div>
    </main>
    <footer className="bottom"><strong>NG...NG...NG...</strong><div className="controls"><button onClick={play}>{playing ? 'Pausar' : count ? 'Cancelar' : 'Iniciar'}</button><button type="button" onClick={startMic}>{mic ? 'Afinador ativo' : 'Ativar afinador'}</button><button onClick={() => setLoop((v) => !v)}>{loop ? 'Loop' : 'Sem loop'}</button><button onClick={() => setMetro((v) => !v)}>{metro ? 'Metrônomo' : 'Sem metrônomo'}</button></div></footer>
  </section>;
}

const css = `.premium-workout{position:relative;height:100%;min-height:100dvh;overflow:hidden;color:#f5f5f2;background:radial-gradient(circle at 33% 21%,rgba(255,255,255,.055),transparent 20%),radial-gradient(circle at 72% 49%,rgba(255,255,255,.035),transparent 22%),linear-gradient(108deg,#161817 0%,#202120 35%,#151616 62%,#0f1010 100%);display:grid;grid-template-rows:184px 28px minmax(0,1fr) 112px;padding:0 0 max(18px,env(safe-area-inset-bottom));font-family:Arial,Helvetica,sans-serif}.premium-workout:before{content:'';position:absolute;inset:-10%;background:linear-gradient(100deg,transparent 0 26%,rgba(255,255,255,.035) 34%,transparent 45% 100%),radial-gradient(ellipse at 20% 72%,rgba(0,0,0,.28),transparent 30%);filter:blur(1px);pointer-events:none}.premium-workout:after{content:'♪     ♫';position:absolute;inset:0;color:rgba(255,255,255,.035);font-size:54px;letter-spacing:110px;display:flex;align-items:center;justify-content:center;transform:rotate(-12deg);pointer-events:none}.premium-workout>*{position:relative;z-index:1}.player-head{display:flex;align-items:end;justify-content:center;padding:0 22px 25px;text-align:center}.player-head strong{display:block;font-family:'Comic Sans MS','Bradley Hand',cursive;font-size:clamp(28px,8.5vw,38px);line-height:1;color:rgba(238,238,238,.72);font-weight:800;text-shadow:0 1px 1px rgba(0,0,0,.55);white-space:nowrap}.time-row{display:grid;grid-template-columns:48px 1fr 48px;gap:8px;align-items:center;margin:0 76px 0 68px;color:rgba(238,238,238,.76);font-size:clamp(21px,6vw,27px);line-height:1}.time-row i{height:8px;background:rgba(210,210,210,.24);border-radius:99px;overflow:hidden}.time-row i b{display:block;height:100%;max-width:100%;background:rgba(230,230,230,.78);border-radius:inherit}.time-row strong{display:none}.stage{min-height:0;position:relative;overflow:visible}.ruler{position:absolute;left:6px;top:-276px;bottom:-3px;width:163px;display:flex;flex-direction:column;justify-content:space-between;font-size:22px;line-height:1;color:rgba(230,230,230,.16);z-index:16;pointer-events:none}.ruler span{position:relative;height:1em}.ruler span:after{content:'';position:absolute;left:56px;top:50%;width:108px;height:2px;background:rgba(238,238,238,.11);border-radius:99px}.ruler .active{color:#ff1414;font-weight:900;text-shadow:0 0 12px rgba(255,0,0,.5);font-size:1em}.ruler .active:after{background:rgba(238,238,238,.18)}.ruler .key{color:rgba(238,238,238,.42);font-weight:800}.body{position:absolute;z-index:1;left:94px;top:77px;width:min(55vw,260px);height:calc(100% + 205px);opacity:.58;mix-blend-mode:screen;pointer-events:none;overflow:visible}.body img{display:block;width:100%;height:100%;object-fit:cover;object-position:left top;filter:contrast(.82) brightness(.86) blur(.1px);mask-image:linear-gradient(90deg,transparent 0,black 9%,black 88%,transparent),linear-gradient(180deg,transparent 0,black 6%,black 82%,transparent 100%);-webkit-mask-image:linear-gradient(90deg,transparent 0,black 9%,black 88%,transparent),linear-gradient(180deg,transparent 0,black 6%,black 82%,transparent 100%)}.register-notes{position:absolute;inset:0;z-index:2;color:rgba(238,238,238,.26);font-family:'Comic Sans MS','Bradley Hand',cursive;font-weight:800;font-size:clamp(23px,6.2vw,34px);line-height:1.18;pointer-events:none;text-shadow:0 1px 0 rgba(0,0,0,.55)}.register-notes span{position:absolute}.register-notes span:nth-child(1){right:-7px;top:126px}.register-notes span:nth-child(2){left:40%;top:267px}.register-notes span:nth-child(3){left:40%;top:520px}.register-notes span:nth-child(4){left:66%;top:844px}.target-lane{position:absolute;left:48px;right:-28px;top:-276px;bottom:-3px;z-index:7;overflow:hidden}.target{position:absolute;height:26px;min-width:84px;border-radius:999px;background:linear-gradient(180deg,rgba(230,230,230,.72),rgba(198,198,198,.72));box-shadow:inset 0 1px 0 rgba(255,255,255,.26),0 0 10px rgba(255,255,255,.06);transform:translateY(-50%);transition:left .035s linear,top .11s ease-out}.voice-marker{position:absolute;left:171px;top:var(--voice-y);width:26px;height:26px;border-radius:50%;background:#d80000;box-shadow:0 0 18px rgba(255,0,0,.4),0 0 3px rgba(255,0,0,.9);transform:translate(-50%,-50%);transition:top .14s ease-out;z-index:18;opacity:var(--voice-opacity)}.voice-marker:before,.voice-marker i{display:none}.status-line{display:none}.bottom{display:flex;align-items:start;justify-content:center;text-align:center;padding-top:14px;z-index:20}.bottom>strong{font-family:'Comic Sans MS','Bradley Hand',cursive;color:rgba(238,238,238,.72);font-size:clamp(28px,8vw,36px);line-height:1;font-weight:900;text-shadow:0 1px 1px rgba(0,0,0,.6)}.controls{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);display:flex;gap:6px;opacity:.04;transition:opacity .2s;z-index:25}.controls:focus-within,.controls:hover{opacity:.92}.controls button{border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.5);color:#fff;border-radius:999px;padding:7px 9px;font-size:11px;font-weight:800}.count-in{position:absolute;inset:0;z-index:50;display:grid;place-items:center;background:rgba(0,0,0,.55);backdrop-filter:blur(12px);text-align:center}.count-in b{font-size:112px;color:#eee;text-shadow:0 0 44px rgba(255,255,255,.26)}.count-in span{text-transform:uppercase;font-weight:950;letter-spacing:.14em;margin-top:-40px}@media(max-width:430px){.premium-workout{grid-template-rows:178px 28px minmax(0,1fr) 105px}.time-row{margin-left:68px;margin-right:76px}.ruler{left:6px;width:162px;font-size:22px}.ruler span:after{left:56px;width:107px}.body{left:99px;top:78px;width:244px}.target-lane{left:50px}.register-notes span:nth-child(1){right:-18px}.register-notes span:nth-child(4){left:64%}}@media(max-width:390px){.player-head strong{font-size:30px}.time-row{margin-left:58px;margin-right:58px;font-size:22px}.ruler{font-size:20px;width:150px}.ruler span:after{left:50px;width:100px}.body{left:82px;width:226px}.voice-marker{left:154px}.target{height:24px;min-width:76px}.register-notes{font-size:23px}.register-notes span:nth-child(2),.register-notes span:nth-child(3){left:38%}}`;
