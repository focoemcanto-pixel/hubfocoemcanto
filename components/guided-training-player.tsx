'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise } from '@/lib/training-center';
import { getTrainingDurationSeconds } from '@/lib/training-center';
import { WireframeBody } from '@/components/vocal/wireframe-body';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PITCHES = Array.from({ length: 8 }, (_, octave) => NOTE_NAMES.map((note) => `${note}${octave}`)).flat().filter((pitch) => {
  const m = pitch.match(/(\d)$/);
  const n = midi(pitch);
  return m && n != null && n >= midi('C0')! && n <= midi('G7')!;
});
const PLAYHEAD = 8;
const SECONDS_TO_PERCENT = 11;

type AudioCtx = typeof AudioContext;
type WinAudio = Window & typeof globalThis & { webkitAudioContext?: AudioCtx };
type Tuner = { frequency: number | null; stableFrequency: number | null; cents: number | null; feedback: string };
type Vars = CSSProperties & { '--voice-y': string; '--progress': string; '--voice-opacity': string };

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function midi(pitch?: string) { const m = pitch?.match(/^([A-G])(#?)(\d)$/); if (!m) return null; const base: Record<string, number> = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 }; return (Number(m[3]) + 1) * 12 + base[m[1]] + (m[2] ? 1 : 0); }
function frequencyFromPitch(pitch?: string) { const value = midi(pitch); return value == null ? null : 440 * 2 ** ((value - 69) / 12); }
function yFromMidi(value: number | null) { if (value == null) return 60; const min = midi('C0')!; const max = midi('G7')!; return clamp(97 - ((value - min) / (max - min)) * 94, 2, 97); }
function pitchY(pitch?: string) { return yFromMidi(midi(pitch)); }
function freqY(freq: number | null) { if (!freq) return null; return yFromMidi(69 + 12 * Math.log2(freq / 440)); }
function region(value: number | null) { if (value == null) return null; if (value >= 72) return 'head'; if (value >= 55) return 'mix'; return 'chest'; }
function fmt(t: number) { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function detect(buffer: Float32Array, sampleRate: number) { let rms = 0; for (let i = 0; i < buffer.length; i++) rms += buffer[i] ** 2; if (Math.sqrt(rms / buffer.length) < .008) return null; let best = 0, bestOffset = -1; for (let offset = Math.floor(sampleRate / 900); offset <= Math.floor(sampleRate / 65); offset++) { let c = 0; for (let i = 0; i < buffer.length - offset; i++) c += buffer[i] * buffer[i + offset]; c /= buffer.length - offset; if (c > best) { best = c; bestOffset = offset; } } return bestOffset > 0 && best > .0012 ? sampleRate / bestOffset : null; }

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
  const last = useRef<number | null>(null);
  const smoothFreq = useRef<number | null>(null);
  const silenceFrames = useRef(0);
  const osc = useRef<OscillatorNode[]>([]);
  const timers = useRef<number[]>([]);
  const targetRef = useRef<number | null>(null);
  const duration = useMemo(() => getTrainingDurationSeconds(exercise), [exercise]);
  const active = exercise.notes.find((n) => time >= n.start && time <= n.start + n.duration);
  const activePitch = active?.pitch || '—';
  const activeMidi = midi(active?.pitch);
  const target = frequencyFromPitch(active?.pitch);
  targetRef.current = target;
  const progress = Math.min(100, (time / duration) * 100);
  const capturedY = freqY(tuner.stableFrequency);
  const hasSignal = capturedY !== null;
  const cssVars = { '--voice-y': `${capturedY ?? 50}%`, '--progress': String(progress), '--voice-opacity': hasSignal ? '1' : '0' } as Vars;

  useEffect(() => { return () => { stopAudio(); stopMic(); }; }, []);
  useEffect(() => { if (!playing) return; last.current = null; const tick = (now: number) => { if (last.current == null) last.current = now; const dt = (now - last.current) / 1000; last.current = now; setTime((old) => { const next = old + dt; if (next >= duration) { if (!loop) { setPlaying(false); stopAudio(); return duration; } stopAudio(); startSound(0); return 0; } return next; }); raf.current = requestAnimationFrame(tick); }; raf.current = requestAnimationFrame(tick); return () => { if (raf.current) cancelAnimationFrame(raf.current); }; }, [playing, duration, loop, metro]);

  function ctx() { if (typeof window === 'undefined') return null; if (!audioCtx.current) { const C = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext; audioCtx.current = C ? new C() : null; } return audioCtx.current; }
  function stopAudio() { timers.current.forEach(clearTimeout); timers.current = []; osc.current.forEach((o) => { try { o.stop(); } catch {} }); osc.current = []; setCount(null); }
  function click(c: AudioContext, at: number, strong = false) { const o = c.createOscillator(); const g = c.createGain(); o.type = 'square'; o.frequency.value = strong ? 1320 : 880; g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(strong ? .22 : .14, at + .006); g.gain.exponentialRampToValueAtTime(.0001, at + .06); o.connect(g); g.connect(c.destination); o.start(at); o.stop(at + .08); osc.current.push(o); }
  function piano(c: AudioContext, f: number, at: number, end: number) { const g = c.createGain(); const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2600; filter.connect(g); g.connect(c.destination); g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.32, at + .01); g.gain.exponentialRampToValueAtTime(.11, at + .22); g.gain.exponentialRampToValueAtTime(.0001, end); [1,2,3].forEach((r) => { const o = c.createOscillator(); const pg = c.createGain(); o.type = r === 1 ? 'triangle' : 'sine'; o.frequency.value = f * r; pg.gain.value = r === 1 ? .75 : r === 2 ? .2 : .08; o.connect(pg); pg.connect(filter); o.start(at); o.stop(end + .04); osc.current.push(o); }); }
  function startSound(from: number) { const c = ctx(); if (!c) return; c.resume().catch(() => null); const now = c.currentTime + .025; const beat = 60 / exercise.bpm; if (metro) for (let b = Math.ceil(from / beat); b * beat <= duration; b++) click(c, now + Math.max(0, b * beat - from), b % 4 === 0); exercise.notes.forEach((n) => { const f = frequencyFromPitch(n.pitch); if (!f || n.start + n.duration <= from) return; piano(c, f, now + Math.max(0, n.start - from), now + Math.max(.18, n.start + n.duration - from)); }); }
  async function play() { if (playing || count) { stopAudio(); setPlaying(false); return; } await startMic(); const c = ctx(); if (!c) { setPlaying(true); return; } c.resume().catch(() => null); stopAudio(); const beatMs = (60 / exercise.bpm) * 1000; [4,3,2,1].forEach((n, i) => timers.current.push(window.setTimeout(() => { setCount(n); click(c, c.currentTime + .01, n === 4); }, i * beatMs))); timers.current.push(window.setTimeout(() => { setCount(null); const start = time >= duration ? 0 : time; setTime(start); startSound(start); setPlaying(true); }, 4 * beatMs)); }
  async function startMic() { if (mic || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return; try { const C = (window as WinAudio).AudioContext || (window as WinAudio).webkitAudioContext; const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); const c = new C(); const src = c.createMediaStreamSource(s); const analyser = c.createAnalyser(); analyser.fftSize = 1024; src.connect(analyser); micCtx.current = c; stream.current = s; setMic(true); listen(analyser, c); } catch { setTuner({ frequency: null, stableFrequency: null, cents: null, feedback: 'Permita o microfone' }); } }
  function stopMic() { if (micRaf.current) cancelAnimationFrame(micRaf.current); stream.current?.getTracks().forEach((t) => t.stop()); micCtx.current?.close().catch(() => null); stream.current = null; micCtx.current = null; setMic(false); }
  function listen(analyser: AnalyserNode, c: AudioContext) { const buffer = new Float32Array(analyser.fftSize); const loopPitch = () => { analyser.getFloatTimeDomainData(buffer); const raw = detect(buffer, c.sampleRate); const targetFreq = targetRef.current; if (!raw) { silenceFrames.current += 1; if (silenceFrames.current > 10) { smoothFreq.current = null; setTuner((old) => ({ ...old, frequency: null, stableFrequency: null, cents: null, feedback: 'Cante próximo ao microfone' })); } } else { silenceFrames.current = 0; smoothFreq.current = smoothFreq.current == null ? raw : smoothFreq.current * .45 + raw * .55; const f = smoothFreq.current; if (!targetFreq) setTuner({ frequency: raw, stableFrequency: f, cents: null, feedback: 'Aguardando nota' }); else { const cents = 1200 * Math.log2(f / targetFreq); const ok = Math.abs(cents) <= 28; setTuner({ frequency: raw, stableFrequency: f, cents, feedback: ok ? 'Perfeito!' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' }); } } micRaf.current = requestAnimationFrame(loopPitch); }; loopPitch(); }

  return <section className="premium-workout" style={cssVars}>
    <style>{css}</style>
    {count ? <div className="count-in"><b>{count}</b><span>prepare a entrada</span></div> : null}
    <header className="player-head"><button onClick={() => { stopAudio(); setPlaying(false); setTime(0); }}>‹</button><div><span>Treino guiado</span><strong>{exercise.title}</strong></div><em>Piano</em></header>
    <div className="time-row"><span>{fmt(time)}</span><i><b style={{ width: `${progress}%` }} /></i><span>{fmt(duration)}</span><strong>♩ {exercise.bpm} BPM</strong></div>
    <main className="stage">
      <div className="ruler">{PITCHES.slice().reverse().map((p) => <span className={p === activePitch ? 'active' : p.endsWith('0') || p === 'C4' || p === 'G3' ? 'key' : ''} key={p}>{p}</span>)}</div>
      <div className="body"><WireframeBody activeRegion={region(activeMidi)} currentMidi={activeMidi} currentLabel={activePitch} /></div>
      <div className="voice-tail" />
      <div className="voice"><i /></div>
      <div className="target-lane">{exercise.notes.map((n, i) => { const left = PLAYHEAD + (n.start - time) * SECONDS_TO_PERCENT; const width = Math.max(4, Math.min(12, n.duration * SECONDS_TO_PERCENT)); const visible = left > -width && left < 112; return visible ? <span className="target" key={`${n.pitch}-${i}`} style={{ left: `${left}%`, width: `${width}%`, top: `${pitchY(n.pitch)}%` }} /> : null; })}</div>
      <div className="status-line">{tuner.feedback}</div>
    </main>
    <footer className="bottom"><div className="cards"><div><strong>NG...NG...NG...</strong><span>Vocal Fry</span><i /></div><button type="button" className="mic" onClick={startMic}><b>🎙</b><span>{mic ? 'Afinador ativo' : 'Ativar afinador'}</span></button><div className="bpm"><strong>{exercise.bpm}</strong><span>BPM</span><small>● ● ●</small></div></div><div className="keys"><span/><span/><span/><span className="on"/><span/><span className="on"/><span/><span/><span/><span/></div><div className="controls"><button onClick={play}>{playing ? 'Pausar' : count ? 'Cancelar' : 'Iniciar'}</button><button onClick={() => setLoop((v) => !v)}>{loop ? 'Loop' : 'Sem loop'}</button><button onClick={() => setMetro((v) => !v)}>{metro ? 'Metrônomo' : 'Sem metrônomo'}</button></div></footer>
  </section>;
}

const css = `.premium-workout{height:100%;min-height:0;overflow:hidden;color:#fff;background:linear-gradient(180deg,#071018,#020305);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:5px;padding:6px 12px 10px}.premium-workout:before{content:'';position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px);background-size:64px 100%,100% 40px;pointer-events:none}.premium-workout>*{position:relative;z-index:1}.player-head{display:grid;grid-template-columns:44px 1fr 70px;gap:8px;align-items:center;min-height:38px}.player-head button,.player-head em{height:36px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.045);border-radius:12px;color:#fff;font-style:normal;display:grid;place-items:center;font-weight:900}.player-head button{font-size:25px}.player-head div{text-align:center;min-width:0}.player-head span{font-size:10px;font-weight:900;color:rgba(255,255,255,.58);letter-spacing:.16em;text-transform:uppercase}.player-head strong{display:block;font-family:Georgia,serif;font-size:clamp(15px,2.2dvh,22px);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.82)}.player-head em{font-size:12px}.time-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center;font-size:clamp(12px,1.65dvh,16px)}.time-row i{height:4px;background:rgba(255,255,255,.18);border-radius:99px;overflow:hidden}.time-row i b{display:block;height:100%;background:linear-gradient(90deg,#ffd84f,#fff);box-shadow:0 0 18px #ffd84f}.time-row strong{white-space:nowrap}.stage{min-height:0;position:relative;overflow:hidden;padding-bottom:clamp(196px,27dvh,258px)}.ruler{position:absolute;left:0;top:0;bottom:clamp(194px,27dvh,255px);width:52px;display:flex;flex-direction:column;justify-content:space-between;font-size:clamp(4px,.62dvh,7px);color:rgba(255,255,255,.24);z-index:16}.ruler span{position:relative;line-height:1}.ruler span:after{content:'';position:absolute;left:24px;top:50%;width:12px;height:1px;background:rgba(255,255,255,.09)}.ruler .active{color:#ff3434;font-weight:950;text-shadow:0 0 12px #f33;font-size:1.55em}.ruler .key{color:#ffd94d;font-weight:950;font-size:1.3em}.body{position:absolute;inset:0;z-index:1;pointer-events:none}.body .wireframe-body-wrap{position:absolute!important;inset:0!important;background:transparent!important;overflow:visible!important}.body .vocal-body-base{left:-6%!important;right:auto!important;top:-8%!important;width:142vw!important;height:98%!important;opacity:.58!important;object-fit:contain!important}.body .body-note-badge{display:none!important}.body .register-label{right:8%!important;color:rgba(255,255,255,.32)!important;font-size:12px!important}.target-lane{position:absolute;left:48px;right:-4px;top:0;bottom:clamp(194px,27dvh,255px);z-index:7}.target{position:absolute;height:clamp(5px,.85dvh,9px);border-radius:999px;background:rgba(255,255,255,.8);box-shadow:0 0 16px rgba(255,255,255,.3);transform:translateY(-50%)}.voice-tail{position:absolute;left:48px;top:var(--voice-y);width:8%;height:4px;border-radius:99px;background:#ffd44a;box-shadow:0 0 18px #ffd44a;transform:translateY(-50%);z-index:10;opacity:var(--voice-opacity)}.voice{position:absolute;left:calc(48px + 8%);top:var(--voice-y);width:21px;height:21px;border-radius:50%;background:#ffd44a;box-shadow:0 0 28px #ffd44a;transform:translate(-50%,-50%);transition:top .018s linear;z-index:12;opacity:var(--voice-opacity)}.voice i{position:absolute;inset:6px;border-radius:50%;background:#fff}.status-line{position:absolute;left:78px;right:10px;bottom:clamp(205px,29dvh,270px);z-index:14;text-align:center;color:#6fff8d;font-weight:900;text-shadow:0 0 18px rgba(111,255,141,.35);font-size:clamp(13px,1.8dvh,18px);pointer-events:none}.bottom{display:grid;gap:8px}.cards{display:grid;grid-template-columns:1.1fr .82fr .82fr;gap:8px}.cards>div,.cards>button,.keys{border:1px solid rgba(255,255,255,.12);background:rgba(8,10,14,.9);border-radius:17px;padding:clamp(8px,1.25dvh,13px);backdrop-filter:blur(10px);color:#fff}.cards strong{display:block;color:#ffd94d}.cards span{color:#ddd;font-size:13px}.cards i{display:block;height:14px;margin-top:7px;background:repeating-linear-gradient(90deg,#ffd94d 0 2px,transparent 2px 8px)}.mic{text-align:center;border:0}.mic b{width:54px;height:54px;border:2px solid #ffd94d;border-radius:50%;display:grid;place-items:center;margin:auto;box-shadow:0 0 22px #ffd94d}.mic span{display:block;color:#6fff8d!important;font-weight:900}.bpm{text-align:center}.bpm strong{font-size:34px;color:#fff}.bpm small{color:#ffd94d}.keys{display:flex;gap:3px;height:clamp(44px,7.2dvh,72px);padding:8px 10px}.keys span{flex:1;border-radius:4px;background:linear-gradient(180deg,#fff,#d9d9d9 46%,#6e6e6e);position:relative}.keys span:after{content:'';position:absolute;right:-7px;top:0;width:12px;height:58%;background:#090909;border-radius:0 0 5px 5px;z-index:2}.keys span:nth-child(3):after,.keys span:nth-child(7):after,.keys span:last-child:after{display:none}.keys .on{background:linear-gradient(180deg,#fff1aa,#ffd038);box-shadow:0 0 20px #ffd94d}.controls{display:flex;gap:7px}.controls button{flex:1;border:1px solid rgba(255,255,255,.14);background:rgba(10,12,16,.9);color:#fff;border-radius:13px;padding:10px 6px;font-weight:950}.controls button:first-child{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07;border:0}.count-in{position:absolute;inset:0;z-index:50;display:grid;place-items:center;background:rgba(0,0,0,.55);backdrop-filter:blur(12px);text-align:center}.count-in b{font-size:112px;color:#ffd94d;text-shadow:0 0 44px #ffd94d}.count-in span{text-transform:uppercase;font-weight:950;letter-spacing:.14em;margin-top:-40px}@media(max-height:760px){.player-head button,.player-head em{height:34px}.stage{padding-bottom:178px}.ruler{bottom:178px}.target-lane{bottom:178px}.status-line{bottom:188px}.keys{height:42px}.cards>div,.cards>button{padding:7px}.controls button{padding:7px 5px}.body .vocal-body-base{height:96%!important;top:-11%!important}}@media(max-width:390px){.time-row{grid-template-columns:auto 1fr auto}.time-row strong{display:none}.cards{gap:6px}.body .vocal-body-base{left:-14%!important;width:154vw!important}}`;
