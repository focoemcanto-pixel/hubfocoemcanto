'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TrainingExercise } from '@/lib/training-center';
import { getTrainingDurationSeconds } from '@/lib/training-center';

const pitchOrder = ['F3','G3','A3','B3','C4','D4','E4','F4','G4','A4','B4','C5','D5','E5','F5','G5'];
const pitchFrequency: Record<string, number> = { C3:130.81,D3:146.83,E3:164.81,F3:174.61,G3:196,A3:220,B3:246.94,C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392,A4:440,B4:493.88,C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99 };

type AudioContextConstructor = typeof AudioContext;
type WindowWithWebAudio = Window & typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
type TunerStatus = 'idle' | 'listening' | 'good' | 'low' | 'high';
type TunerState = { frequency: number | null; cents: number | null; status: TunerStatus; feedback: string };
type StageStyle = CSSProperties & { '--progress': string };

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function pitchToY(pitch: string) { const index = pitchOrder.indexOf(pitch); if (index === -1) return 52; return clamp(88 - (index / Math.max(1, pitchOrder.length - 1)) * 76, 9, 89); }
function frequencyToY(frequency: number | null) { if (!frequency) return 62; const midi = 69 + 12 * Math.log2(frequency / 440); return clamp(88 - ((midi - 53) / 24) * 76, 9, 89); }
function formatTime(value: number) { const total = Math.max(0, Math.floor(value)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; }

function autoCorrelate(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.018) return null;
  let bestOffset = -1;
  let bestCorrelation = 0;
  const minOffset = Math.floor(sampleRate / 900);
  const maxOffset = Math.floor(sampleRate / 70);
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - offset; i += 1) correlation += buffer[i] * buffer[i + offset];
    correlation /= buffer.length - offset;
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestOffset = offset; }
  }
  if (bestOffset <= 0 || bestCorrelation < 0.002) return null;
  return sampleRate / bestOffset;
}

export function GuidedTrainingPlayer({ exercise, compact = false }: { exercise: TrainingExercise; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const micAnimationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const synthContextRef = useRef<AudioContext | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);
  const countInTimeoutsRef = useRef<number[]>([]);
  const targetFrequencyRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const [micEnabled, setMicEnabled] = useState(false);
  const [tuner, setTuner] = useState<TunerState>({ frequency: null, cents: null, status: 'idle', feedback: 'Preparando afinador' });

  const duration = useMemo(() => getTrainingDurationSeconds(exercise), [exercise]);
  const activeNote = exercise.notes.find((note) => currentTime >= note.start && currentTime <= note.start + note.duration);
  const targetFrequency = activeNote ? pitchFrequency[activeNote.pitch] || null : null;
  targetFrequencyRef.current = targetFrequency;
  const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));
  const voiceY = frequencyToY(tuner.frequency);
  const centsDisplay = tuner.cents === null ? '—' : `${tuner.cents > 0 ? '+' : ''}${Math.round(tuner.cents)}`;
  const currentPitchLabel = activeNote?.pitch || '—';
  const stageStyle = { '--progress': String(progress) } as StageStyle;

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);
  useEffect(() => { startMic(); return () => { stopAllAudio(); stopMic(); }; }, []);

  useEffect(() => {
    if (!isPlaying) return;
    lastFrameRef.current = null;
    function tick(timestamp: number) {
      if (lastFrameRef.current === null) lastFrameRef.current = timestamp;
      const delta = ((timestamp - lastFrameRef.current) / 1000) * speed;
      lastFrameRef.current = timestamp;
      setCurrentTime((value) => {
        const next = value + delta;
        if (next >= duration) {
          if (!loop) { setIsPlaying(false); audioRef.current?.pause(); stopAllAudio(); return duration; }
          stopAllAudio();
          if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => undefined); } else { startSynth(0); }
          startMetronome(0);
          return 0;
        }
        return next;
      });
      animationRef.current = window.requestAnimationFrame(tick);
    }
    animationRef.current = window.requestAnimationFrame(tick);
    return () => { if (animationRef.current) window.cancelAnimationFrame(animationRef.current); };
  }, [duration, isPlaying, loop, speed, metronomeOn]);

  function getSynthContext() {
    if (typeof window === 'undefined') return null;
    if (!synthContextRef.current) {
      const browserWindow = window as WindowWithWebAudio;
      const Context = browserWindow.AudioContext || browserWindow.webkitAudioContext;
      synthContextRef.current = Context ? new Context() : null;
    }
    return synthContextRef.current;
  }

  async function startMic() {
    if (micEnabled || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const browserWindow = window as WindowWithWebAudio;
      const Context = browserWindow.AudioContext || browserWindow.webkitAudioContext;
      if (!Context) throw new Error('AudioContext unavailable');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const context = new Context();
      const source = context.createMediaStreamSource(stream);
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);
      micContextRef.current = context;
      micStreamRef.current = stream;
      setMicEnabled(true);
      setTuner({ frequency: null, cents: null, status: 'listening', feedback: 'Afinador ativo' });
      listenToPitch(analyserNode, context);
    } catch { setTuner({ frequency: null, cents: null, status: 'idle', feedback: 'Permita o microfone' }); }
  }

  function stopMic() {
    if (micAnimationRef.current) window.cancelAnimationFrame(micAnimationRef.current);
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micContextRef.current?.close().catch(() => undefined);
    micAnimationRef.current = null; micStreamRef.current = null; micContextRef.current = null;
    setMicEnabled(false);
  }

  function listenToPitch(analyserNode: AnalyserNode, audioContext: AudioContext) {
    const buffer = new Float32Array(analyserNode.fftSize);
    function loopPitch() {
      analyserNode.getFloatTimeDomainData(buffer);
      const frequency = autoCorrelate(buffer, audioContext.sampleRate);
      const currentTarget = targetFrequencyRef.current;
      if (!frequency || !currentTarget) {
        setTuner({ frequency: frequency || null, cents: null, status: 'listening', feedback: frequency ? 'Aguardando nota' : 'Cante próximo ao microfone' });
      } else {
        const cents = 1200 * Math.log2(frequency / currentTarget);
        const abs = Math.abs(cents);
        const status: TunerStatus = abs <= 28 ? 'good' : cents < 0 ? 'low' : 'high';
        setTuner({ frequency, cents, status, feedback: abs <= 28 ? 'Perfeito!' : cents < 0 ? 'Suba um pouco' : 'Desça um pouco' });
      }
      micAnimationRef.current = window.requestAnimationFrame(loopPitch);
    }
    loopPitch();
  }

  function clearCountIn() { countInTimeoutsRef.current.forEach((id) => window.clearTimeout(id)); countInTimeoutsRef.current = []; setIsCountingIn(false); setCountInBeat(null); }
  function stopAllAudio() { clearCountIn(); activeOscillatorsRef.current.forEach((oscillator) => { try { oscillator.stop(); } catch { } }); activeOscillatorsRef.current = []; }
  function playClick(context: AudioContext, startsAt: number, strong = false) { const osc = context.createOscillator(); const gain = context.createGain(); osc.type = 'square'; osc.frequency.value = strong ? 1320 : 880; gain.gain.setValueAtTime(0.0001, startsAt); gain.gain.exponentialRampToValueAtTime(strong ? 0.22 : 0.14, startsAt + 0.006); gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.06); osc.connect(gain); gain.connect(context.destination); osc.start(startsAt); osc.stop(startsAt + 0.08); activeOscillatorsRef.current.push(osc); }
  function playPianoNote(context: AudioContext, frequency: number, startsAt: number, endsAt: number) { const master = context.createGain(); const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(4200, startsAt); filter.frequency.exponentialRampToValueAtTime(1600, Math.max(startsAt + 0.12, endsAt - 0.02)); filter.connect(master); master.connect(context.destination); master.gain.setValueAtTime(0.0001, startsAt); master.gain.exponentialRampToValueAtTime(0.34, startsAt + 0.008); master.gain.exponentialRampToValueAtTime(0.12, startsAt + 0.22); master.gain.exponentialRampToValueAtTime(0.0001, endsAt); [{ ratio: 1, gain: .75, type: 'triangle' as OscillatorType }, { ratio: 2, gain: .22, type: 'sine' as OscillatorType }, { ratio: 3, gain: .08, type: 'sine' as OscillatorType }].forEach((p) => { const osc = context.createOscillator(); const gain = context.createGain(); osc.type = p.type; osc.frequency.value = frequency * p.ratio; gain.gain.value = p.gain; osc.connect(gain); gain.connect(filter); osc.start(startsAt); osc.stop(endsAt + .04); activeOscillatorsRef.current.push(osc); }); }
  function startSynth(startAt: number) { const context = getSynthContext(); if (!context) return; context.resume().catch(() => undefined); const now = context.currentTime + .04; exercise.notes.forEach((note) => { const frequency = pitchFrequency[note.pitch]; if (!frequency) return; const noteStart = (note.start - startAt) / speed; const noteEnd = noteStart + note.duration / speed; if (noteEnd <= 0) return; playPianoNote(context, frequency, now + Math.max(0, noteStart), now + Math.max(.18, noteEnd)); }); }
  function startMetronome(startAt: number) { if (!metronomeOn) return; const context = getSynthContext(); if (!context) return; context.resume().catch(() => undefined); const beatUnit = 60 / Math.max(1, exercise.bpm); const now = context.currentTime + .04; const firstBeatIndex = Math.max(0, Math.ceil(startAt / beatUnit)); for (let beat = firstBeatIndex; beat * beatUnit <= duration; beat += 1) { const beatTime = beat * beatUnit; playClick(context, now + Math.max(0, (beatTime - startAt) / speed), beat % 4 === 0); } }
  function beginPlayback(startAt: number) { clearCountIn(); stopAllAudio(); setCurrentTime(startAt); startMic(); if (audioRef.current) { audioRef.current.currentTime = startAt; audioRef.current.playbackRate = speed; audioRef.current.play().catch(() => undefined); } else { startSynth(startAt); } startMetronome(startAt); setIsPlaying(true); }
  function startCountInThenPlay(startAt: number) { const context = getSynthContext(); if (!context) return beginPlayback(startAt); stopAllAudio(); context.resume().catch(() => undefined); setIsCountingIn(true); const beatMs = (60 / Math.max(1, exercise.bpm) / speed) * 1000; [4,3,2,1].forEach((value,index) => { const timeout = window.setTimeout(() => { setCountInBeat(value); playClick(context, context.currentTime + .01, value === 4); }, index * beatMs); countInTimeoutsRef.current.push(timeout); }); const startTimeout = window.setTimeout(() => beginPlayback(startAt), 4 * beatMs); countInTimeoutsRef.current.push(startTimeout); }
  function togglePlayback() { if (isPlaying || isCountingIn) { audioRef.current?.pause(); stopAllAudio(); setIsPlaying(false); return; } startCountInThenPlay(currentTime >= duration ? 0 : currentTime); }
  function restart() { audioRef.current?.pause(); stopAllAudio(); setIsPlaying(false); setCurrentTime(0); if (audioRef.current) audioRef.current.currentTime = 0; }

  return (
    <section className={`premium-workout ${compact ? 'compact' : ''} tuner-${tuner.status}`} style={stageStyle}>
      <style>{css}</style>
      {exercise.audioUrl ? <audio ref={audioRef} src={exercise.audioUrl} loop={loop} /> : null}
      {isCountingIn ? <div className="count-in-overlay"><span>{countInBeat}</span><small>prepare a entrada</small></div> : null}

      <header className="premium-top"><button type="button" onClick={restart} className="back-btn">‹</button><div><span>Exercício 1</span><strong>{exercise.title}</strong></div><button type="button" className="piano-pill">Piano ▮▮▮</button></header>
      <div className="time-row"><span>{formatTime(currentTime)}</span><div className="timeline"><i style={{ width: `${progress}%` }} /></div><span>{formatTime(duration)}</span><b>♩ {exercise.bpm} BPM</b></div>

      <main className="workout-stage">
        <div className="pitch-ruler">{pitchOrder.slice().reverse().map((pitch) => <span className={pitch === currentPitchLabel ? 'active' : pitch === 'G3' || pitch === 'C4' ? 'key' : ''} key={pitch}>{pitch}</span>)}<div className="ruler-glow" style={{ top: `${voiceY}%` }} /></div>
        <div className="silhouette" aria-hidden="true"><svg viewBox="0 0 220 420"><path d="M112 20 150 45 170 96 160 158 132 196 126 260 174 322 196 408 50 408 66 320 96 260 92 205 66 166 50 115 70 56Z" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.18)"/><path d="M112 20 70 56 150 45 92 205 160 158 66 320 126 260 196 408 M50 115 170 96 66 166 132 196 50 408 M96 260 174 322 66 320" fill="none" stroke="rgba(255,255,255,.23)"/></svg></div>
        <div className="moving-field">
          <div className="moving-canvas">
            <svg className="path-svg" viewBox="0 0 980 420" preserveAspectRatio="none"><path className="target-path-shadow" d="M20 300 C70 300 100 300 130 300 S178 250 210 250 S250 232 286 232 S330 164 370 164 S432 138 475 138 S526 82 566 82 S620 82 670 82 S740 30 790 30 S850 30 940 30"/><path className="target-path" d="M20 300 C70 300 100 300 130 300 S178 250 210 250 S250 232 286 232 S330 164 370 164 S432 138 475 138 S526 82 566 82 S620 82 670 82 S740 30 790 30 S850 30 940 30"/><path className="voice-trace" d="M20 312 C76 315 118 287 150 286 S190 246 224 248 S272 222 304 226 S344 170 388 170 S430 142 478 148 S526 88 568 90 S638 86 680 84 S735 35 790 36"/></svg>
            {exercise.notes.map((note, index) => <span className="note-node" key={`${note.pitch}-${index}`} style={{ left: `${16 + index * 13}%`, top: `${pitchToY(note.pitch)}%` }} />)}
          </div>
        </div>
        <div className="voice-dot" style={{ top: `${voiceY}%` }}><span /></div>
      </main>

      <section className="feedback-card"><strong>{tuner.feedback}</strong><b>{centsDisplay}</b><span>cents</span><small>{tuner.status === 'good' ? 'Muito bem! Continue assim ✅' : micEnabled ? 'Ajuste até a bolinha entrar no caminho.' : 'Permita o microfone para iniciar o afinador.'}</small></section>

      <section className="bottom-grid"><div className="vocal-card"><strong>NG...NG...NG...</strong><span>Vocal Fry</span><i /></div><div className="mic-card"><div className="mic-circle">🎙</div><span>{micEnabled ? 'Afinador ativo' : 'Ativando afinador'}</span></div><div className="bpm-card"><strong>{exercise.bpm}</strong><span>BPM</span><i><em /></i></div></section>
      <div className="keyboard"><span/><span/><span/><span className="on"/><span/><span className="on"/><span/><span/><span/></div>
      <p className="tip">💡 Dica: mantenha a voz leve e relaxada. Não force e não aumente o volume.</p>
      <div className="controls"><button className="primary" type="button" onClick={togglePlayback}>{isPlaying ? 'Pausar' : isCountingIn ? 'Cancelar' : 'Iniciar'}</button><button type="button" onClick={() => setLoop((value) => !value)}>{loop ? 'Loop' : 'Sem loop'}</button><button type="button" onClick={() => setMetronomeOn((value) => !value)}>{metronomeOn ? 'Metrônomo' : 'Sem metrônomo'}</button></div>
    </section>
  );
}

const css = `.premium-workout{min-height:100dvh;background:radial-gradient(circle at 50% 26%,rgba(255,212,91,.1),transparent 28%),linear-gradient(180deg,#091017,#030507);color:#fff;padding:20px 16px 26px;overflow:hidden;position:relative}.premium-workout:before{content:'';position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px);background-size:64px 100%,100% 40px;opacity:.85;pointer-events:none}.premium-workout>*{position:relative;z-index:1}.premium-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.premium-top div{text-align:center}.premium-top span{display:block;color:#d5d8df;font-weight:800}.premium-top strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:25px;color:#d8d8d8;margin-top:5px}.back-btn,.piano-pill{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.055);color:#fff;border-radius:18px;min-height:52px;padding:0 16px;font-size:28px}.piano-pill{font-size:14px;font-weight:900}.time-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;margin:22px 0 10px;color:#e7e7e7}.time-row b{font-weight:900}.timeline{height:4px;border-radius:99px;background:rgba(255,255,255,.18);overflow:hidden}.timeline i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#ffd94d,#fff);box-shadow:0 0 18px #ffd94d}.workout-stage{height:620px;position:relative;overflow:hidden}.pitch-ruler{position:absolute;left:0;top:4px;bottom:4px;width:62px;display:flex;flex-direction:column;justify-content:space-between;color:rgba(255,255,255,.38);font-size:18px}.pitch-ruler span{position:relative}.pitch-ruler span:after{content:'';position:absolute;left:36px;right:-14px;top:50%;height:1px;background:rgba(255,255,255,.12)}.pitch-ruler .active{color:#ff3434;font-weight:950}.pitch-ruler .key{color:#ffd94d;font-weight:950}.ruler-glow{position:absolute;right:-16px;width:32px;height:76px;border-radius:999px;background:linear-gradient(180deg,transparent,#ffd94d,transparent);box-shadow:0 0 34px #ffd94d;transform:translateY(-50%)}.silhouette{position:absolute;left:84px;top:50px;width:230px;opacity:.72;filter:drop-shadow(0 0 18px rgba(255,255,255,.08));animation:silGlow 2.4s ease-in-out infinite}.silhouette svg{width:100%;height:auto}.moving-field{position:absolute;left:120px;right:-120px;top:60px;bottom:150px;overflow:hidden}.moving-canvas{position:absolute;left:0;top:0;width:980px;height:100%;transform:translateX(calc(var(--progress) * -4.9px));transition:transform .08s linear}.path-svg{position:absolute;inset:0;width:980px;height:100%}.target-path-shadow{fill:none;stroke:rgba(255,255,255,.15);stroke-width:26;stroke-linecap:round;filter:blur(12px)}.target-path{fill:none;stroke:#fff;stroke-width:8;stroke-linecap:round;filter:drop-shadow(0 0 18px rgba(255,255,255,.85))}.voice-trace{fill:none;stroke:#ffd44a;stroke-width:5;stroke-linecap:round;filter:drop-shadow(0 0 18px #ffd44a);stroke-dasharray:620;stroke-dashoffset:calc(620 - (var(--progress) * 6.2))}.note-node{position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 0 22px #fff;transform:translate(-50%,-50%)}.voice-dot{position:absolute;left:132px;width:30px;height:30px;border-radius:50%;background:#ffd44a;box-shadow:0 0 34px #ffd44a;transform:translateY(-50%);transition:top .08s linear}.voice-dot span{position:absolute;inset:8px;border-radius:50%;background:#fff}.feedback-card{margin:-112px auto 14px;width:min(100%,440px);border:1px solid rgba(255,255,255,.14);background:rgba(5,8,11,.82);backdrop-filter:blur(16px);border-radius:24px;padding:18px;text-align:center;box-shadow:0 28px 80px rgba(0,0,0,.3)}.feedback-card strong{display:block;color:#6fff8d;font-size:24px}.feedback-card b{display:block;font-size:48px;line-height:1;margin-top:10px}.feedback-card span,.feedback-card small{display:block;color:#d4d4d4}.bottom-grid{display:grid;grid-template-columns:1fr .8fr .8fr;gap:12px}.bottom-grid>div,.keyboard,.tip{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.045);border-radius:18px;padding:14px;box-shadow:0 18px 50px rgba(0,0,0,.2)}.vocal-card strong{display:block;color:#ffd94d}.vocal-card span{color:#ddd}.vocal-card i{display:block;height:22px;margin-top:12px;background:repeating-linear-gradient(90deg,#ffd94d 0 2px,transparent 2px 8px);opacity:.8}.mic-card{text-align:center}.mic-circle{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;border:2px solid #ffd94d;margin:0 auto 8px;box-shadow:0 0 26px rgba(255,217,77,.45);font-size:32px}.mic-card span{color:#6fff8d;font-weight:900}.bpm-card{text-align:center}.bpm-card strong{font-size:38px}.bpm-card span{display:block;color:#ddd}.bpm-card i{display:flex;justify-content:center;gap:7px;margin-top:10px}.bpm-card i:before,.bpm-card i:after,.bpm-card i em{content:'';width:10px;height:10px;border-radius:50%;background:#ffd94d;display:block}.keyboard{display:flex;gap:4px;height:78px;margin-top:12px}.keyboard span{flex:1;border-radius:4px;background:linear-gradient(180deg,#fff,#777);position:relative}.keyboard span:after{content:'';position:absolute;top:0;right:-9px;width:16px;height:45px;background:#111;border-radius:0 0 5px 5px;z-index:2}.keyboard span.on{background:linear-gradient(180deg,#ffe999,#ffd038);box-shadow:0 0 20px rgba(255,217,77,.75)}.tip{margin-top:12px;color:#d8d8d8;text-align:center}.controls{display:flex;gap:8px;margin-top:12px}.controls button{flex:1;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;border-radius:14px;padding:12px 10px;font-weight:900}.controls .primary{background:linear-gradient(180deg,#ffe39b,#e9b348);color:#160f07;border:0}.count-in-overlay{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:rgba(0,0,0,.52);backdrop-filter:blur(12px);text-align:center}.count-in-overlay span{display:block;font-size:112px;font-weight:950;color:#ffd94d;text-shadow:0 0 44px #ffd94d}.count-in-overlay small{display:block;text-transform:uppercase;letter-spacing:.14em;font-weight:950;color:#fff;margin-top:-30px}@keyframes silGlow{0%,100%{opacity:.55}50%{opacity:.82}}@media(max-width:700px){.premium-workout{padding:20px 14px 26px}.premium-top strong{font-size:23px}.time-row{grid-template-columns:auto 1fr auto;}.time-row b{grid-column:3}.workout-stage{height:620px}.silhouette{left:88px;width:210px}.moving-field{left:118px;right:-220px}.feedback-card{margin-top:-116px}.bottom-grid{grid-template-columns:1fr .7fr .78fr;gap:8px}.bottom-grid>div{padding:12px}.keyboard{height:70px}.tip{font-size:15px}.controls button{font-size:12px;padding:11px 6px}}`;
