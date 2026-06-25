'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise, TrainingNote } from '@/lib/training-center';
import { getTrainingDurationSeconds } from '@/lib/training-center';
import { WireframeBody } from '@/components/vocal/wireframe-body';

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
function vocalRegion(value: number | null) { if (value === null) return null; if (value >= 72) return 'head'; if (value >= 55) return 'mix'; return 'chest'; }
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
  const activeMidi = midi(activeNote?.pitch);
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
    <header className="player-head"><button onClick={() => { stopAudio(); setPlaying(false); setTime(0); }}>‹</button><div><span>Treino guiado</span><strong>{exercise.title}</strong></div><em>Piano</em></header>
    <div className="time-row"><span>{fmt(time)}</span><i><b style={{ width: `${progress}%` }} /></i><span>{fmt(duration)}</span><strong>♩ {exercise.bpm} BPM</strong></div>
    <main className="stage">
      <div className="ruler">{PITCHES.slice().reverse().map((p) => <span className={p === activePitch ? 'active' : p === 'C4' || p === 'G3' || p.endsWith('0') ? 'key' : ''} key={p}>{p}</span>)}</div>
      <div className="body"><WireframeBody activeRegion={vocalRegion(activeMidi)} currentMidi={activeMidi} currentLabel={activePitch} /></div>
      <div className="voice-marker"><i /></div>
      <div className="target-lane">{exercise.notes.map((note, index) => { const style = getTargetStyle(note); return style ? <span className="target" key={`${note.pitch}-${index}`} style={style} /> : null; })}</div>
      <div className="status-line">{tuner.feedback}</div>
    </main>
    <footer className="bottom"><div className="cards"><div><strong>NG...NG...NG...</strong><span>Vocal Fry</span><i /></div><button type="button" className="mic" onClick={startMic}><b>🎙</b><span>{mic ? 'Afinador ativo' : 'Ativar afinador'}</span></button><div className="bpm"><strong>{exercise.bpm}</strong><span>BPM</span><small>● ● ●</small></div></div><div className="keys"><span/><span/><span/><span className="on"/><span/><span className="on"/><span/><span/><span/><span/></div><div className="controls"><button onClick={play}>{playing ? 'Pausar' : count ? 'Cancelar' : 'Iniciar'}</button><button onClick={() => setLoop((v) => !v)}>{loop ? 'Loop' : 'Sem loop'}</button><button onClick={() => setMetro((v) => !v)}>{metro ? 'Metrônomo' : 'Sem metrônomo'}</button></div></footer>
  </section>;
}

const css = `.premium-workout{height:100%;min-height:0;overflow:hidden;color:#fff;background:linear-gradient(180deg,#071018,#020305);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:5px;padding:6px 12px 10px}.premium-workout:before{content:'';position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px);background-size:64px 100%,100% 40px;pointer-events:none}.premium-workout>*{position:relative;z-index:1}.player-head{display:grid;grid-template-columns:44px 1fr 70px;gap:8px;align-items:center;min-height:38px}.player-head button,.player-head em{height:36px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.045);border-radius:12px;color:#fff;font-style:normal;display:grid;place-items:center;font-weight:900}.player-head button{font-size:25px}.player-head div{text-align:center;min-width:0}.player-head span{font-size:10px;font-weight:900;color:rgba(255,255,255,.58);letter-spacing:.16em;text-transform:uppercase}.player-head strong{display:block;font-family:Georgia,serif;font-size:clamp(15px,2.2dvh,22px);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.82)}.player-head em{font-size:12px}.time-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center;font-size:clamp(12px,1.65dvh,16px)}.time-row i{height:4px;background:rgba(255,255,255,.18);border-radius:99px;overflow:hidden}.time-row i b{display:block;height:100%;background:linear-gradient(90deg,#ffd84f,#fff);box-shadow:0 0 18px #ffd84f}.time-row strong{white-space:nowrap}.stage{min-height:0;position:relative;overflow:hidden;padding-bottom:clamp(196px,27dvh,258px)}.ruler{position:absolute;left:0;top:0;bottom:clamp(194px,27dvh,255px);width:52px;display:flex;flex-direction:column;justify-content:space-between;font-size:clamp(4px,.62dvh,7px);color:rgba(255,255,255,.24);z-index:16}.ruler span{position:relative;line-height:1}.ruler span:after{content:'';position:absolute;left:24px;top:50%;width:12px;height:1px;background:rgba(255,255,255,.09)}.ruler .active{color:#ff3434;font-weight:950;text-shadow:0 0 12px #f33;font-size:1.55em}.ruler .key{color:#ffd94d;font-weight:950;font-size:1.3em}.body{position:absolute;inset:0;z-index:1;pointer-events:none}.body .wireframe-body-wrap{position:absolute!important;inset:0!important;background:transparent!important;overflow:visible!important}.body .vocal-body-base{left:-6%!important;right:auto!important;top:-8%!important;width:142vw!important;height:98%!important;opacity:.58!important;object-fit:contain!important}.body .body-note-badge{display:none!important}.body .register-label{right:8%!important;color:rgba(255,255,255,.32)!important;font-size:12px!important}.target-lane{position:absolute;left:48px;right:-4px;top:0;bottom:clamp(194px,27dvh,255px);z-index:7}.target{position:absolute;height:clamp(5px,.85dvh,9px);border-radius:999px;background:rgba(255,255,255,.8);box-shadow:0 0 16px rgba(255,255,255,.3);transform:translateY(-50%);transition:left .02s linear,top .02s linear}.voice-marker{position:absolute;left:calc(48px + 12%);top:var(--voice-y);width:21px;height:21px;border-radius:50%;background:#ffd44a;box-shadow:0 0 28px #ffd44a;transform:translate(-50%,-50%);transition:top .018s linear;z-index:12;opacity:var(--voice-opacity)}.voice-marker:before{content:'';position:absolute;right:14px;top:50%;width:54px;height:4px;border-radius:999px;background:#ffd44a;box-shadow:0 0 18px #ffd44a;transform:translateY(-50%)}.voice-marker i{position:absolute;inset:6px;border-radius:50%;background:#fff}.status-line{position:absolute;left:78px;right:10px;bottom:clamp(205px,29dvh,270px);z-index:14;text-align:center;color:#6fff8d;font-weight:900;text-shadow:0 0 18px rgba(111,255,141,.35);font-size:clamp(13px,1.8dvh,18px);pointer-events:none}.bottom{display:grid;gap:8px}.cards{display:grid;grid-template-columns:1.1fr .82fr .82fr;gap:8px}.cards>div,.cards>button,.keys{border:1px solid rgba(255,255,255,.12);background:rgba(8,10,14,.9);border-radius:17px;padding:clamp(8px,1.25dvh,13px);backdrop-filter:blur(10px);color:#fff}.cards strong{display:block;color:#ffd94d}.cards span{color:#ddd;font-size:13px}.cards i{display:block;height:14px;margin-top:7px;background:repeating-linear-gradient(90deg,#ffd94d 0 2px,transparent 2px 8px)}.mic{text-align:center;border:0}.mic b{width:54px;height:54px;border:2px solid #ffd94d;border-radius:50%;display:grid;place-items:center;margin:auto;box-shadow:0 0 22px #ffd94d}.mic span{display:block;color:#6fff8d!important;font-weight:900}.bpm{text-align:center}.bpm strong{font-size:34px;color:#fff}.bpm small{color:#ffd94d}.keys{display:flex;gap:3px;height:clamp(44px,7.2dvh,72px);padding:8px 10px}.keys span{flex:1;border-radius:4px;background:linear-gradient(180deg,#fff,#d9d9d9 46%,#6e6e6e);position:relative}.keys span:after{content:'';position:absolute;right:-7px;top:0;width:12px;height:58%;background:#090909;border-radius:0 0 5px 5px;z-index:2}.keys span:nth-child(3):after,.keys span:nth-child(7):after,.keys span:last-child:after{display:none}.keys .on{background:linear-gradient(180deg,#fff1aa,#ffd038);box-shadow:0 0 20px #ffd94d}.controls{display:flex;gap:7px}.controls button{flex:1;border:1px solid rgba(255,255,255,.14);background:rgba(10,12,16,.9);color:#fff;border-radius:13px;padding:10px 6px;font-weight:950}.controls button:first-child{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07;border:0}.count-in{position:absolute;inset:0;z-index:50;display:grid;place-items:center;background:rgba(0,0,0,.55);backdrop-filter:blur(12px);text-align:center}.count-in b{font-size:112px;color:#ffd94d;text-shadow:0 0 44px #ffd94d}.count-in span{text-transform:uppercase;font-weight:950;letter-spacing:.14em;margin-top:-40px}@media(max-height:760px){.player-head button,.player-head em{height:34px}.stage{padding-bottom:178px}.ruler{bottom:178px}.target-lane{bottom:178px}.status-line{bottom:188px}.keys{height:42px}.cards>div,.cards>button{padding:7px}.controls button{padding:7px 5px}.body .vocal-body-base{height:96%!important;top:-11%!important}}@media(max-width:390px){.time-row{grid-template-columns:auto 1fr auto}.time-row strong{display:none}.cards{gap:6px}.body .vocal-body-base{left:-14%!important;width:154vw!important}}`;
