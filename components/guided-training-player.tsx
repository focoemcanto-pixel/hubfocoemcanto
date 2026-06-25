'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise, TrainingNote } from '@/lib/training-center';
import { getTrainingDurationSeconds } from '@/lib/training-center';
import { WireframeBody } from '@/components/vocal/wireframe-body';

const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MIN = 'C0';
const MAX = 'G7';
const PLAYHEAD = 12;
const SPEED = 10;
const PREVIEW = 9;
const PITCHES = Array.from({ length: 8 }, (_, o) => NAMES.map((n) => `${n}${o}`)).flat().filter((p) => {
  const v = midi(p);
  return v !== null && v >= midi(MIN)! && v <= midi(MAX)!;
});

type AudioCtor = typeof AudioContext;
type WinAudio = Window & typeof globalThis & { webkitAudioContext?: AudioCtor };
type Tuner = { frequency: number | null; stableFrequency: number | null; cents: number | null; feedback: string };
type Vars = CSSProperties & { '--voice-y': string; '--voice-opacity': string; '--progress': string };

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function midi(pitch?: string) {
  const m = pitch?.match(/^([A-G])(#?)(\d)$/);
  if (!m) return null;
  const base: Record<string, number> = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  return (Number(m[3]) + 1) * 12 + base[m[1]] + (m[2] ? 1 : 0);
}
function freqFromPitch(pitch?: string) {
  const v = midi(pitch);
  return v === null ? null : 440 * 2 ** ((v - 69) / 12);
}
function yFromMidi(v: number | null) {
  if (v === null) return 60;
  return clamp(97 - ((v - midi(MIN)!) / (midi(MAX)! - midi(MIN)!)) * 94, 2, 97);
}
function yFromPitch(p?: string) { return yFromMidi(midi(p)); }
function yFromFreq(f: number | null) { return f ? yFromMidi(69 + 12 * Math.log2(f / 440)) : null; }
function normalizeToTarget(f: number, target: number | null) {
  if (!target) return f;
  let n = f;
  while (n < target / Math.SQRT2) n *= 2;
  while (n > target * Math.SQRT2) n /= 2;
  return n;
}
function region(v: number | null) { if (v === null) return null; return v >= 72 ? 'head' : v >= 55 ? 'mix' : 'chest'; }
function fmt(t: number) { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2,'0')}`; }
function detectPitch(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] ** 2;
  if (Math.sqrt(rms / buffer.length) < 0.006) return null;
  let best = 0, bestOffset = -1;
  for (let offset = Math.floor(sampleRate / 950); offset <= Math.floor(sampleRate / 60); offset++) {
    let corr = 0;
    for (let i = 0; i < buffer.length - offset; i++) corr += buffer[i] * buffer[i + offset];
    corr /= buffer.length - offset;
    if (corr > best) { best = corr; bestOffset = offset; }
  }
  return bestOffset > 0 && best > 0.001 ? sampleRate / bestOffset : null;
}

export function GuidedTrainingPlayer({ exercise }: { exercise: TrainingExercise; compact?: boolean }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [loop, setLoop] = useState(true);
  const [metro, setMetro] = useState(true);
  const [mic, setMic] = useState(false);
  const [tuner, setTuner] = useState<Tuner>({ frequency: null, stableFrequency: null, cents: null, feedback: 'Toque em iniciar e permita o microfone' });

  const audioCtx = useRef<AudioContext | null>(null);
  const micCtx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const micRaf = useRef<number | null>(null);
  const lastFrame = useRef<number | null>(null);
  const smooth = useRef<number | null>(null);
  const silence = useRef(0);
  const oscillators = useRef<OscillatorNode[]>([]);
  const timers = useRef<number[]>([]);
  const targetRef = useRef<number | null>(null);

  const duration = useMemo(() => getTrainingDurationSeconds(exercise), [exercise]);
  const active = exercise.notes.find((n) => time >= n.start && time <= n.start + n.duration);
  const activePitch = active?.pitch || '—';
  const activeMidi = midi(active?.pitch);
  targetRef.current = freqFromPitch(active?.pitch);
  const y = yFromFreq(tuner.stableFrequency);
  const progress = Math.min(100, (time / duration) * 100);
  const cssVars = { '--voice-y': `${y ?? 50}%`, '--voice-opacity': tuner.stableFrequency ? '1' : '0', '--progress': String(progress) } as Vars;

  useEffect(() => () => { stopAudio(); stopMic(); }, []);
  useEffect(() => {
    if (!playing) return;
    lastFrame.current = null;
    const tick = (now: number) => {
      if (lastFrame.current === null) lastFrame.current = now;
      const delta = (now - lastFrame.current) / 1000;
      lastFrame.current = now;
      setTime((old) => {
        const next = old + delta;
        if (next >= duration) {
          if (!loop) { setPlaying(false); stopAudio(); return duration; }
          stopAudio(); playSound(0); return 0;
        }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, duration, loop, metro]);

  function ctx() {
    if (typeof window === 'undefined') return null;
    if (!audioCtx.current) {
      const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext;
      audioCtx.current = Ctor ? new Ctor() : null;
    }
    return audioCtx.current;
  }
  function stopAudio() { timers.current.forEach(clearTimeout); timers.current = []; oscillators.current.forEach((o) => { try { o.stop(); } catch {} }); oscillators.current = []; setCount(null); }
  function click(c: AudioContext, at: number, strong = false) { const o = c.createOscillator(); const g = c.createGain(); o.type = 'square'; o.frequency.value = strong ? 1320 : 880; g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(strong ? .22 : .14, at + .006); g.gain.exponentialRampToValueAtTime(.0001, at + .06); o.connect(g); g.connect(c.destination); o.start(at); o.stop(at + .08); oscillators.current.push(o); }
  function piano(c: AudioContext, f: number, at: number, end: number) { const master = c.createGain(); const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2600; filter.connect(master); master.connect(c.destination); master.gain.setValueAtTime(.0001, at); master.gain.exponentialRampToValueAtTime(.32, at + .01); master.gain.exponentialRampToValueAtTime(.11, at + .22); master.gain.exponentialRampToValueAtTime(.0001, end); [1,2,3].forEach((r) => { const o = c.createOscillator(); const g = c.createGain(); o.type = r === 1 ? 'triangle' : 'sine'; o.frequency.value = f * r; g.gain.value = r === 1 ? .75 : r === 2 ? .2 : .08; o.connect(g); g.connect(filter); o.start(at); o.stop(end + .04); oscillators.current.push(o); }); }
  function playSound(from: number) { const c = ctx(); if (!c) return; c.resume().catch(() => null); const now = c.currentTime + .025; const beat = 60 / exercise.bpm; if (metro) for (let b = Math.ceil(from / beat); b * beat <= duration; b++) click(c, now + Math.max(0, b * beat - from), b % 4 === 0); exercise.notes.forEach((n) => { const f = freqFromPitch(n.pitch); if (!f || n.start + n.duration <= from) return; piano(c, f, now + Math.max(0, n.start - from), now + Math.max(.18, n.start + n.duration - from)); }); }

  async function play() { if (playing || count) { stopAudio(); setPlaying(false); return; } await startMic(); const c = ctx(); if (!c) { setPlaying(true); return; } c.resume().catch(() => null); stopAudio(); const beatMs = (60 / exercise.bpm) * 1000; [4,3,2,1].forEach((v, i) => timers.current.push(window.setTimeout(() => { setCount(v); click(c, c.currentTime + .01, v === 4); }, i * beatMs))); timers.current.push(window.setTimeout(() => { setCount(null); const start = time >= duration ? 0 : time; setTime(start); playSound(start); setPlaying(true); }, 4 * beatMs)); }
  async function startMic() { if (mic || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return; try { const Ctor = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext; const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); const c = new Ctor(); const source = c.createMediaStreamSource(s); const analyser = c.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0; source.connect(analyser); micCtx.current = c; stream.current = s; setMic(true); listen(analyser, c); } catch { setTuner((old) => ({ ...old, feedback: 'Permita o microfone' })); } }
  function stopMic() { if (micRaf.current) cancelAnimationFrame(micRaf.current); stream.current?.getTracks().forEach((t) => t.stop()); micCtx.current?.close().catch(() => null); stream.current = null; micCtx.current = null; setMic(false); }
  function listen(analyser: AnalyserNode, c: AudioContext) { const buffer = new Float32Array(analyser.fftSize); const loopPitch = () => { analyser.getFloatTimeDomainData(buffer); const raw = detectPitch(buffer, c.sampleRate); const target = targetRef.current; if (!raw) { silence.current += 1; if (silence.current > 5) setTuner((old) => ({ ...old, frequency: null, cents: null, feedback: 'Cante próximo ao microfone' })); } else { silence.current = 0; const normalized = normalizeToTarget(raw, target); smooth.current = smooth.current === null ? normalized : smooth.current * .18 + normalized * .82; const stable = smooth.current; if (!target) setTuner({ frequency: raw, stableFrequency: stable, cents: null, feedback: 'Aguardando nota' }); else { const cents = 1200 * Math.log2(stable / target); setTuner({ frequency: raw, stableFrequency: stable, cents, feedback: Math.abs(cents) <= 28 ? 'Perfeito!' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' }); } } micRaf.current = requestAnimationFrame(loopPitch); }; loopPitch(); }
  function getTargetStyle(note: TrainingNote): CSSProperties | null { const left = PLAYHEAD + (note.start - time) * SPEED; const width = Math.max(4, note.duration * SPEED); if (left + width <= -4 || left >= PLAYHEAD + PREVIEW * SPEED) return null; return { left: `${left}%`, width: `${width}%`, top: `${yFromPitch(note.pitch)}%` }; }

  return <section className="premium-workout" style={cssVars}>
    <style>{css}</style>
    {count ? <div className="count-in"><b>{count}</b><span>prepare a entrada</span></div> : null}
    <header className="player-head"><button onClick={() => { stopAudio(); setPlaying(false); setTime(0); }}>‹</button><div><span>Treino guiado</span><strong>{exercise.title}</strong></div><em>Piano</em></header>
    <div className="time-row"><span>{fmt(time)}</span><i><b style={{ width: `${progress}%` }} /></i><span>{fmt(duration)}</span><strong>♩ {exercise.bpm} BPM</strong></div>
    <main className="stage">
      <div className="ruler">{PITCHES.slice().reverse().map((pitch) => <span className={pitch === activePitch ? 'active' : pitch === 'C4' || pitch === 'G3' || pitch.endsWith('0') ? 'key' : ''} key={pitch}>{pitch}</span>)}</div>
      <div className="playhead-line" />
      <div className="body"><WireframeBody activeRegion={region(activeMidi)} currentMidi={activeMidi} currentLabel={activePitch} /></div>
      <div className="target-lane">{exercise.notes.map((note, index) => { const style = getTargetStyle(note); return style ? <span className="target" key={`${note.pitch}-${index}`} style={style} /> : null; })}</div>
      <div className="voice-marker"><i /></div>
      <div className="status-line">{tuner.feedback}</div>
    </main>
    <footer className="bottom"><div className="cards"><div><strong>NG...NG...NG...</strong><span>Vocal Fry</span><i /></div><button type="button" className="mic" onClick={startMic}><b>🎙</b><span>{mic ? 'Afinador ativo' : 'Ativar afinador'}</span></button><div className="bpm"><strong>{exercise.bpm}</strong><span>BPM</span><small>● ● ●</small></div></div><div className="keys"><span/><span/><span/><span className="on"/><span/><span className="on"/><span/><span/><span/><span/></div><div className="controls"><button onClick={play}>{playing ? 'Pausar' : count ? 'Cancelar' : 'Iniciar'}</button><button onClick={() => setLoop((v) => !v)}>{loop ? 'Loop' : 'Sem loop'}</button><button onClick={() => setMetro((v) => !v)}>{metro ? 'Metrônomo' : 'Sem metrônomo'}</button></div></footer>
  </section>;
}

const css = `.premium-workout{height:100%;min-height:0;overflow:hidden;color:#fff;background:linear-gradient(180deg,#071018,#020305);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:5px;padding:6px 12px 10px}.premium-workout:before{content:'';position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px);background-size:64px 100%,100% 40px;pointer-events:none}.premium-workout>*{position:relative;z-index:1}.player-head{display:grid;grid-template-columns:44px 1fr 70px;gap:8px;align-items:center;min-height:38px}.player-head button,.player-head em{height:36px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.045);border-radius:12px;color:#fff;font-style:normal;display:grid;place-items:center;font-weight:900}.player-head button{font-size:25px}.player-head div{text-align:center;min-width:0}.player-head span{font-size:10px;font-weight:900;color:rgba(255,255,255,.58);letter-spacing:.16em;text-transform:uppercase}.player-head strong{display:block;font-family:Georgia,serif;font-size:clamp(15px,2.2dvh,22px);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.82)}.player-head em{font-size:12px}.time-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center;font-size:clamp(12px,1.65dvh,16px)}.time-row i{height:4px;background:rgba(255,255,255,.18);border-radius:99px;overflow:hidden}.time-row i b{display:block;height:100%;background:linear-gradient(90deg,#ffd84f,#fff);box-shadow:0 0 18px #ffd84f}.time-row strong{white-space:nowrap}.stage{min-height:0;position:relative;overflow:hidden;padding-bottom:clamp(196px,27dvh,258px)}.ruler{position:absolute;left:0;top:0;bottom:clamp(194px,27dvh,255px);width:52px;display:flex;flex-direction:column;justify-content:space-between;font-size:clamp(4px,.62dvh,7px);color:rgba(255,255,255,.24);z-index:18}.ruler span{position:relative;line-height:1}.ruler span:after{content:'';position:absolute;left:24px;top:50%;width:12px;height:1px;background:rgba(255,255,255,.09)}.ruler .active{color:#ff3434;font-weight:950;text-shadow:0 0 12px #f33;font-size:1.55em}.ruler .key{color:#ffd94d;font-weight:950;font-size:1.3em}.playhead-line{position:absolute;left:calc(48px + 12%);top:0;bottom:clamp(194px,27dvh,255px);width:1px;background:rgba(255,255,255,.22);z-index:6}.body{position:absolute;inset:0;z-index:1;pointer-events:none}.body .wireframe-body-wrap{position:absolute!important;inset:0!important;background:transparent!important;overflow:visible!important}.body .vocal-body-base{left:-6%!important;right:auto!important;top:-8%!important;width:142vw!important;height:98%!important;opacity:.58!important;object-fit:contain!important}.body .body-note-badge{display:none!important}.body .register-label{right:8%!important;color:rgba(255,255,255,.32)!important;font-size:12px!important}.target-lane{position:absolute;left:48px;right:-4px;top:0;bottom:clamp(194px,27dvh,255px);z-index:8}.target{position:absolute;height:clamp(5px,.85dvh,9px);border-radius:999px;background:rgba(255,255,255,.82);box-shadow:0 0 16px rgba(255,255,255,.32);transform:translateY(-50%);will-change:left}.voice-marker{position:absolute;left:calc(48px + 12%);top:var(--voice-y);width:21px;height:21px;border-radius:50%;background:#ff1414;box-shadow:0 0 28px rgba(255,20,20,.9);transform:translate(-50%,-50%);transition:top .035s linear;z-index:14;opacity:var(--voice-opacity)}.voice-marker:before{content:'';position:absolute;right:12px;top:50%;width:54px;height:4px;border-radius:999px;background:#d91414;box-shadow:0 0 18px rgba(255,20,20,.65);transform:translateY(-50%)}.voice-marker i{position:absolute;inset:6px;border-radius:50%;background:#ff4b4b}.status-line{position:absolute;left:78px;right:10px;bottom:clamp(205px,29dvh,270px);z-index:14;text-align:center;color:#6fff8d;font-weight:900;text-shadow:0 0 18px rgba(111,255,141,.35);font-size:clamp(13px,1.8dvh,18px);pointer-events:none}.bottom{display:grid;gap:8px}.cards{display:grid;grid-template-columns:1.1fr .82fr .82fr;gap:8px}.cards>div,.cards>button,.keys{border:1px solid rgba(255,255,255,.12);background:rgba(8,10,14,.9);border-radius:17px;padding:clamp(8px,1.25dvh,13px);backdrop-filter:blur(10px);color:#fff}.cards strong{display:block;color:#ffd94d}.cards span{color:#ddd;font-size:13px}.cards i{display:block;height:14px;margin-top:7px;background:repeating-linear-gradient(90deg,#ffd94d 0 2px,transparent 2px 8px)}.mic{text-align:center;border:0}.mic b{width:54px;height:54px;border:2px solid #ffd94d;border-radius:50%;display:grid;place-items:center;margin:auto;box-shadow:0 0 22px #ffd94d}.mic span{display:block;color:#6fff8d!important;font-weight:900}.bpm{text-align:center}.bpm strong{font-size:34px;color:#fff}.bpm small{color:#ffd94d}.keys{display:flex;gap:3px;height:clamp(44px,7.2dvh,72px);padding:8px 10px}.keys span{flex:1;border-radius:4px;background:linear-gradient(180deg,#fff,#d9d9d9 46%,#6e6e6e);position:relative}.keys span:after{content:'';position:absolute;right:-7px;top:0;width:12px;height:58%;background:#090909;border-radius:0 0 5px 5px;z-index:2}.keys span:nth-child(3):after,.keys span:nth-child(7):after,.keys span:last-child:after{display:none}.keys .on{background:linear-gradient(180deg,#fff1aa,#ffd038);box-shadow:0 0 20px #ffd94d}.controls{display:flex;gap:7px}.controls button{flex:1;border:1px solid rgba(255,255,255,.14);background:rgba(10,12,16,.9);color:#fff;border-radius:13px;padding:10px 6px;font-weight:950}.controls button:first-child{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07;border:0}.count-in{position:absolute;inset:0;z-index:50;display:grid;place-items:center;background:rgba(0,0,0,.55);backdrop-filter:blur(12px);text-align:center}.count-in b{font-size:112px;color:#ffd94d;text-shadow:0 0 44px #ffd94d}.count-in span{text-transform:uppercase;font-weight:950;letter-spacing:.14em;margin-top:-40px}@media(max-height:760px){.player-head button,.player-head em{height:34px}.stage{padding-bottom:178px}.ruler{bottom:178px}.target-lane{bottom:178px}.playhead-line{bottom:178px}.status-line{bottom:188px}.keys{height:42px}.cards>div,.cards>button{padding:7px}.controls button{padding:7px 5px}.body .vocal-body-base{height:96%!important;top:-11%!important}}@media(max-width:390px){.time-row{grid-template-columns:auto 1fr auto}.time-row strong{display:none}.cards{gap:6px}.body .vocal-body-base{left:-14%!important;width:154vw!important}}`;
