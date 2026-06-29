'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Mic2, Play, RefreshCw, Save, Sparkles } from 'lucide-react';
import { classifyVoice, detectPitch, midiToBrazilianNoteName, midiToFrequency, formatBrazilianNote } from '@/lib/audio/pitch';
import { VocalNoteMeter } from './vocal-note-meter';

type Captured = { note: string; midi: number; frequency: number };
type Gender = 'masculino' | 'feminino' | 'nao_informar';
type Step = 'intro' | 'range' | 'tess-high' | 'tess-low' | 'gender' | 'result';
type Props = { profileId: string; authUserId?: string | null; initialProfile?: any };
type PitchFrame = { frequencyHz: number; midiFloat: number; midiRounded: number; confidence: number; rms?: number };
type StableFrame = PitchFrame & { midiStable: number; heldMs: number };
type AudioHandle = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  stream: MediaStream;
  raf: number;
  data: Float32Array;
  lastRaw: PitchFrame | null;
  lastRawAt: number;
  lastDisplayedMidi: number | null;
  candidateMidi: number | null;
  candidateStartAt: number;
  candidateFrames: number;
  lastStable: StableFrame | null;
  lastStableAt: number;
};

const MIN_CONFIDENCE = 0.56;
const STABLE_FRAMES = 5;
const STABLE_MS = 180;
const MAX_NOTE_DRIFT = 0.72;
const HOLD_MS = 180;
const MAX_REASONABLE_JUMP = 7;
const LOWEST_TEST_MIDI = 24;
const HIGHEST_TEST_MIDI = 90;

function capturedFromMidi(midiFloat: number, frequency?: number): Captured {
  const midi = Math.round(midiFloat);
  return { midi, note: midiToBrazilianNoteName(midi), frequency: frequency || midiToFrequency(midiFloat) };
}

function clampMidi(midi: number) {
  return Math.max(LOWEST_TEST_MIDI, Math.min(HIGHEST_TEST_MIDI, midi));
}

function makeStableFrame(frame: PitchFrame, midiStable: number, heldMs: number): StableFrame {
  return { ...frame, midiStable, heldMs };
}

function acceptStableFrame(handle: AudioHandle, frame: PitchFrame, now: number): StableFrame | null {
  if (frame.confidence < MIN_CONFIDENCE) return null;
  const rounded = clampMidi(Math.round(frame.midiFloat));
  if (handle.candidateMidi == null || Math.abs(frame.midiFloat - handle.candidateMidi) > MAX_NOTE_DRIFT) {
    handle.candidateMidi = rounded;
    handle.candidateStartAt = now;
    handle.candidateFrames = 1;
    return null;
  }

  handle.candidateFrames += 1;
  const heldMs = now - handle.candidateStartAt;
  if (handle.candidateFrames < STABLE_FRAMES || heldMs < STABLE_MS) return null;

  const lastStableMidi = handle.lastStable?.midiStable;
  if (lastStableMidi != null && Math.abs(rounded - lastStableMidi) > MAX_REASONABLE_JUMP && heldMs < 320) return null;

  const stable = makeStableFrame(frame, rounded, heldMs);
  handle.lastStable = stable;
  handle.lastStableAt = now;
  return stable;
}

function displayMidi(handle: AudioHandle, target: number) {
  const previous = handle.lastDisplayedMidi;
  if (previous == null) {
    handle.lastDisplayedMidi = target;
    return target;
  }
  const next = previous + (target - previous) * 0.28;
  handle.lastDisplayedMidi = next;
  return next;
}

export function VocalRangeTest({ profileId, authUserId, initialProfile }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [micError, setMicError] = useState('');
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null);
  const [currentMidi, setCurrentMidi] = useState<number | null>(null);
  const [stableMidi, setStableMidi] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [captureReview, setCaptureReview] = useState(false);
  const [lowest, setLowest] = useState<Captured | null>(initialProfile?.lowest_midi ? { note: formatBrazilianNote(initialProfile.lowest_midi ?? initialProfile.lowest_note), midi: initialProfile.lowest_midi, frequency: Number(initialProfile.lowest_frequency || midiToFrequency(initialProfile.lowest_midi)) } : null);
  const [highest, setHighest] = useState<Captured | null>(initialProfile?.highest_midi ? { note: formatBrazilianNote(initialProfile.highest_midi ?? initialProfile.highest_note), midi: initialProfile.highest_midi, frequency: Number(initialProfile.highest_frequency || midiToFrequency(initialProfile.highest_midi)) } : null);
  const [tessHigh, setTessHigh] = useState<number | null>(initialProfile?.tessitura_high_midi ?? null);
  const [tessLow, setTessLow] = useState<number | null>(initialProfile?.tessitura_low_midi ?? null);
  const [gender, setGender] = useState<Gender>((initialProfile?.gender as Gender) || 'nao_informar');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [tessituraSteps, setTessituraSteps] = useState<any[]>([]);
  const audioRef = useRef<AudioHandle | null>(null);
  const stepRef = useRef<Step>(step);
  const isListeningRef = useRef(false);
  const captureReviewRef = useRef(false);

  const result = useMemo(() => classifyVoice({ tessituraLowMidi: tessLow, tessituraHighMidi: tessHigh, lowestMidi: lowest?.midi, highestMidi: highest?.midi, gender }), [tessLow, tessHigh, lowest, highest, gender]);
  const validation = useMemo(() => {
    if (!lowest || !highest || tessLow == null || tessHigh == null) return 'Complete todas as etapas para gerar seu mapa vocal.';
    if (highest.midi - lowest.midi < 5) return 'A extensão capturada ficou pequena demais. Refaça cantando do grave ao agudo.';
    if (lowest.midi > highest.midi) return 'A nota grave ficou acima da nota aguda. Refaça a avaliação.';
    if (tessLow < lowest.midi) return 'A tessitura grave ficou fora da extensão capturada. Refaça essa etapa.';
    if (tessHigh > highest.midi) return 'A tessitura aguda ficou fora da extensão capturada. Refaça essa etapa.';
    if (tessLow > tessHigh) return 'A tessitura grave ficou acima da aguda. Refaça a avaliação.';
    return '';
  }, [lowest, highest, tessLow, tessHigh]);

  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { captureReviewRef.current = captureReview; }, [captureReview]);
  useEffect(() => () => stopMic(), []);
  useEffect(() => { document.body.classList.toggle('vocal-capture-active', step === 'range'); return () => document.body.classList.remove('vocal-capture-active'); }, [step]);

  function prepareRangeCapture() {
    stopMic();
    setStep('range');
    setMicError('');
    setSaveMessage('');
    setLowest(null);
    setHighest(null);
    setCurrentFrequency(null);
    setCurrentMidi(null);
    setStableMidi(null);
    setCaptureReview(false);
    setIsListening(false);
  }

  async function beginRangeCapture() {
    setLowest(null);
    setHighest(null);
    setCaptureReview(false);
    setMicError('');
    setIsListening(true);
    try { await openPitchMonitor(); } catch { setIsListening(false); setMicError('Não conseguimos acessar seu microfone. Verifique as permissões do navegador.'); }
  }

  async function openPitchMonitor() {
    if (audioRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtor({ latencyHint: 'interactive' });
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const handle: AudioHandle = { ctx, analyser, stream, raf: 0, data, lastRaw: null, lastRawAt: 0, lastDisplayedMidi: null, candidateMidi: null, candidateStartAt: 0, candidateFrames: 0, lastStable: null, lastStableAt: 0 };

    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      const now = performance.now();
      const pitch = detectPitch(data, ctx.sampleRate);
      const rawFrame = pitch && pitch.confidence >= MIN_CONFIDENCE ? { frequencyHz: pitch.frequencyHz, midiFloat: pitch.midiFloat, midiRounded: pitch.midiRounded, confidence: pitch.confidence, rms: pitch.rms } : null;
      const heldRaw = !rawFrame && handle.lastRaw && now - handle.lastRawAt <= HOLD_MS ? handle.lastRaw : null;
      const frame = rawFrame || heldRaw;

      if (rawFrame) {
        handle.lastRaw = rawFrame;
        handle.lastRawAt = now;
      }

      if (frame) {
        const visualMidi = displayMidi(handle, clampMidi(frame.midiFloat));
        setCurrentMidi(visualMidi);
        setCurrentFrequency(midiToFrequency(visualMidi));
        const stable = rawFrame ? acceptStableFrame(handle, rawFrame, now) : null;
        if (stable) {
          setStableMidi(stable.midiStable);
          if (stepRef.current === 'range' && isListeningRef.current && !captureReviewRef.current) {
            const item = capturedFromMidi(stable.midiStable, stable.frequencyHz);
            setLowest((old) => !old || item.midi < old.midi ? item : old);
            setHighest((old) => !old || item.midi > old.midi ? item : old);
          }
        }
      } else {
        handle.candidateMidi = null;
        handle.candidateFrames = 0;
        handle.lastDisplayedMidi = null;
        setCurrentFrequency(null);
        setCurrentMidi(null);
        setStableMidi(null);
      }
      handle.raf = requestAnimationFrame(tick);
    };

    audioRef.current = handle;
    handle.raf = requestAnimationFrame(tick);
  }

  function stopMic() {
    const audio = audioRef.current;
    if (!audio) return;
    cancelAnimationFrame(audio.raf);
    audio.stream.getTracks().forEach((track) => track.stop());
    audio.ctx.close().catch(() => undefined);
    audioRef.current = null;
  }

  async function startTessituraMonitor() { if (audioRef.current) return; setMicError(''); try { await openPitchMonitor(); } catch { setMicError('Ative o microfone para validar sua afinação em tempo real.'); } }
  useEffect(() => { if (step === 'tess-high' || step === 'tess-low') void startTessituraMonitor(); else if (step !== 'range') { stopMic(); setCurrentFrequency(null); setCurrentMidi(null); setStableMidi(null); } }, [step]);

  function finishMapping() {
    if (!lowest || !highest || highest.midi - lowest.midi < 5 || captureReview) return;
    stopMic();
    setIsListening(false);
    setCaptureReview(true);
  }
  function retryMapping() { prepareRangeCapture(); }
  function confirmRangeAndGoToTessitura() { if (!lowest || !highest) return; stopMic(); setTessHigh(highest.midi); setTessLow(lowest.midi); setStep('tess-high'); }
  function resetAll() { stopMic(); setStep('intro'); setLowest(null); setHighest(null); setTessHigh(null); setTessLow(null); setSaveMessage(''); setTessituraSteps([]); setCaptureReview(false); setIsListening(false); }

  async function playNote(midi: number) {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtor();
    await ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = midiToFrequency(midi);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 2.25);
    window.setTimeout(() => ctx.close().catch(() => undefined), 2500);
  }

  async function save() {
    if (validation) { setSaveMessage(validation); return; }
    setSaving(true);
    setSaveMessage('');
    const payload = { profileId, authUserId, lowest, highest, tessituraLowMidi: tessLow, tessituraHighMidi: tessHigh, gender, classification: result.classification, confidence: result.confidence, tessituraSteps, userAgent: navigator.userAgent };
    const response = await fetch('/api/vocal-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSaving(false);
    setSaveMessage(response.ok ? 'Mapa Vocal salvo no seu perfil.' : 'Não foi possível salvar agora. Tente novamente.');
  }

  const captureRange = lowest && highest ? `${lowest.note} — ${highest.note}` : '—';
  const captureReady = Boolean(lowest && highest && highest.midi - lowest.midi >= 5);
  const liveNote = stableMidi != null ? midiToBrazilianNoteName(stableMidi) : currentMidi != null ? midiToBrazilianNoteName(currentMidi) : '—';
  const highTuner = getTunerState(currentFrequency, tessHigh);
  const lowTuner = getTunerState(currentFrequency, tessLow);

  return <div className="vocal-test-shell"><style>{css}</style>
    {step === 'intro' && <section className="vocal-stage hero"><Sparkles size={34} /><h1>Vamos criar seu Mapa Vocal</h1><p>Esse teste identifica sua extensão e sua tessitura confortável com captura estável, sem marcar ruído como nota.</p><p className="tip">Cante com volume moderado. Não force.</p>{micError && <strong className="error">{micError}</strong>}<button onClick={prepareRangeCapture}><Mic2 /> Iniciar avaliação</button></section>}
    {step === 'range' && <section className="vocal-stage range-stage"><div className="range-meter"><VocalNoteMeter currentMidi={currentMidi} lowestMidi={lowest?.midi} highestMidi={highest?.midi} minMidi={LOWEST_TEST_MIDI} maxMidi={HIGHEST_TEST_MIDI} /></div><div className="range-panel"><p className="eyebrow">ETAPA 1/3</p><h1>Mapeie sua extensão vocal</h1><p>Cante do grave ao agudo. A régua só marca extremos quando a nota fica estável por alguns frames.</p><div className="live-card"><span>Nota atual</span><strong>{liveNote}</strong><small>{stableMidi != null ? 'nota estável detectada' : isListening ? 'aguardando estabilidade...' : 'microfone pausado'}</small></div>{captureReview && <div className="capture-result"><span>Extensão captada</span><strong>{captureRange}</strong><small>Confirme para seguir ou tente novamente.</small></div>}{!captureReview && <div className="capture-result"><span>Extremos confirmados</span><strong>{captureRange}</strong><small>{captureReady ? 'Pronto para finalizar.' : 'Continue cantando do grave ao agudo.'}</small></div>}{micError && <strong className="error">{micError}</strong>}<div className="actions">{!isListening && !captureReview ? <button onClick={beginRangeCapture}><Mic2 /> Ativar microfone</button> : <button disabled={!captureReady} onClick={() => captureReview ? confirmRangeAndGoToTessitura() : finishMapping()}>{captureReview ? 'Confirmar extensão' : 'Pressione quando terminar'}</button>}<button onClick={retryMapping}><RefreshCw /> Tentar de novo</button><button onClick={resetAll}>Sair</button></div></div></section>}
    {step === 'tess-high' && highest && tessHigh != null && <Tessitura title="Tessitura vocal" text="Agora encontre seu agudo confortável. Repita a palavra na nota sugerida." midi={tessHigh} tuner={highTuner} onPlay={playNote} onMove={() => { setTessHigh(Math.max(lowest?.midi ?? LOWEST_TEST_MIDI, tessHigh - 1)); setTessituraSteps((s) => [...s, { area: 'high', action: 'down', midi: tessHigh - 1 }]); }} onConfirm={() => setStep('tess-low')} onExit={resetAll} />}
    {step === 'tess-low' && lowest && tessLow != null && <Tessitura title="Tessitura vocal" text="Agora encontre seu grave confortável. Repita a palavra na nota sugerida." midi={tessLow} tuner={lowTuner} icon="up" onPlay={playNote} onMove={() => { setTessLow(Math.min(highest?.midi ?? HIGHEST_TEST_MIDI, tessLow + 1)); setTessituraSteps((s) => [...s, { area: 'low', action: 'up', midi: tessLow + 1 }]); }} onConfirm={() => setStep('gender')} onExit={resetAll} />}
    {step === 'gender' && <section className="vocal-stage hero"><h1>Selecione uma referência vocal</h1><p>Essa informação ajuda apenas a estimar melhor a tendência vocal.</p><div className="choice-grid">{[['masculino','Masculino'],['feminino','Feminino'],['nao_informar','Prefiro não informar']].map(([value,label]) => <button className={gender === value ? 'selected' : ''} key={value} onClick={() => setGender(value as Gender)}>{label}</button>)}</div><button onClick={() => setStep('result')}>Ver resultado</button></section>}
    {step === 'result' && lowest && highest && <section className="vocal-stage hero result"><h1>Seu Mapa Vocal</h1><div className="result-grid"><article><span>Extensão</span><strong>{lowest.note} → {highest.note}</strong></article><article><span>Tessitura confortável</span><strong>{tessLow != null ? midiToBrazilianNoteName(tessLow) : '—'} → {tessHigh != null ? midiToBrazilianNoteName(tessHigh) : '—'}</strong></article><article><span>Tendência vocal</span><strong>{result.classification}</strong></article><article><span>Confiança</span><strong>{Math.round(result.confidence * 100)}%</strong></article></div>{validation && <strong className="error">{validation}</strong>}{saveMessage && <strong className="save-message">{saveMessage}</strong>}<div className="actions"><button disabled={saving || Boolean(validation)} onClick={save}><Save /> {saving ? 'Salvando...' : 'Salvar no meu perfil'}</button><button onClick={resetAll}><RefreshCw /> Refazer</button><Link href="/aluno/biblioteca">Ver aulas recomendadas</Link></div></section>}
  </div>;
}

function getTunerState(currentFrequency: number | null, targetMidi?: number | null) {
  if (!currentFrequency || targetMidi == null) return { cents: null as number | null, x: 50, status: 'waiting', label: 'Cante para validar a nota' };
  const targetFrequency = midiToFrequency(targetMidi);
  const rawCents = 1200 * Math.log2(currentFrequency / targetFrequency);
  const pitchClassCents = ((((rawCents + 600) % 1200) + 1200) % 1200) - 600;
  const x = Math.max(5, Math.min(95, 50 + Math.tanh(pitchClassCents / 35) * 45));
  const abs = Math.abs(pitchClassCents);
  if (abs <= 7) return { cents: pitchClassCents, x: 50, status: 'in-tune', label: 'Afinado! Mantenha a nota...' };
  return { cents: pitchClassCents, x, status: pitchClassCents < 0 ? 'low' : 'high', label: pitchClassCents < 0 ? 'Abaixo da nota' : 'Acima da nota' };
}

function Tessitura({ title, text, midi, tuner, icon, onPlay, onMove, onConfirm, onExit }: any) {
  const note = midiToBrazilianNoteName(midi);
  return <section className="vocal-stage tessitura-stage"><button type="button" className="tessitura-exit" onClick={onExit}>‹</button><div className="tessitura-copy"><p className="eyebrow">ETAPA 2/3</p><h1>{title}</h1><p>{text}</p><div className="tessitura-note-card"><div><span>NOTA SUGERIDA</span><strong>{note}</strong></div><button type="button" onClick={() => onPlay(midi)}><Play /><b>{note}</b></button></div><div className={`tessitura-tuner ${tuner?.status || 'waiting'}`} style={{ '--tuner-x': `${tuner?.x ?? 50}%` } as any}><span>MONITORAMENTO</span><div className="tessitura-scale"><b /><i /></div><p><Check size={18} /> {tuner?.label}</p></div><div className="actions"><button onClick={onConfirm}><Check /> Consegui com conforto</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} Difícil / ajustar nota</button></div></div></section>;
}

const css = `.vocal-test-shell{min-height:100dvh;padding:18px 14px 110px;color:#fff;background:#050507}.vocal-stage{max-width:1120px;margin:0 auto;border:1px solid rgba(255,255,255,.12);border-radius:30px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.45);padding:24px}.vocal-stage.hero{text-align:center;display:grid;gap:18px;place-items:center}.vocal-stage h1{margin:0;font-size:clamp(34px,7vw,58px);letter-spacing:-.06em}.vocal-stage p{margin:0;color:rgba(255,255,255,.72);font-size:18px;line-height:1.45}.eyebrow{color:#67e8f9!important;font-size:12px!important;text-transform:uppercase;letter-spacing:.18em;font-weight:1000}.tip,.vocal-stage small{color:#f5c76b!important}.vocal-stage button,.vocal-stage a{border:0;border-radius:18px;padding:15px 18px;background:linear-gradient(180deg,#ffe29a,#e8ad34);color:#120d05;font-weight:950;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px}.actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.actions button:nth-child(n+2){background:rgba(255,255,255,.09);color:#fff;border:1px solid rgba(255,255,255,.12)}.range-stage{display:grid;grid-template-columns:minmax(360px,1.1fr) minmax(0,.9fr);gap:22px;align-items:stretch}.range-panel{align-self:center;display:grid;gap:16px}.live-card,.capture-result,.tessitura-note-card,.tessitura-tuner{border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(0,0,0,.25);padding:16px}.live-card span,.capture-result span,.tessitura-note-card span,.tessitura-tuner span{display:block;color:rgba(255,255,255,.56);font-size:12px;font-weight:1000;letter-spacing:.13em;text-transform:uppercase}.live-card strong{font-size:58px;line-height:1;color:#67e8f9}.capture-result strong{display:block;font-size:26px;color:#f5c76b}.error{color:#fecaca}.save-message{color:#bbf7d0}.choice-grid,.result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:760px}.result-grid{grid-template-columns:repeat(2,1fr)}.result-grid article{border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:18px;background:rgba(0,0,0,.25)}.result-grid span{display:block;color:rgba(255,255,255,.62);margin-bottom:7px}.result-grid strong{font-size:24px}.tessitura-stage{min-height:80dvh;display:grid;place-items:center}.tessitura-copy{max-width:660px;display:grid;gap:16px}.tessitura-exit{position:absolute;left:20px;top:20px;border-radius:999px!important;background:rgba(255,255,255,.08)!important;color:#fff!important}.tessitura-note-card{display:flex;justify-content:space-between;gap:14px;align-items:center}.tessitura-note-card strong{font-size:44px;color:#67e8f9}.tessitura-tuner .tessitura-scale{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,#f87171,#f5c76b,#67e8f9,#f5c76b,#f87171);margin:14px 0}.tessitura-tuner .tessitura-scale i{position:absolute;left:var(--tuner-x);top:50%;width:18px;height:18px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);box-shadow:0 0 22px #67e8f9}body.vocal-capture-active{overflow:hidden!important}@media(max-width:760px){.vocal-test-shell{padding:0;background:#020304}.range-stage{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;margin:0!important;padding:12px!important;border:0!important;border-radius:0!important;background:#020304!important;box-shadow:none!important;overflow:auto!important;z-index:2147483647!important;display:grid;grid-template-columns:1fr}.range-meter{min-height:58dvh}.range-meter .premium-vocal-meter{min-height:58dvh!important;height:58dvh!important}.range-panel{padding:0 6px 24px}.live-card strong{font-size:48px}.choice-grid,.result-grid{grid-template-columns:1fr}.vocal-stage.hero,.tessitura-stage{min-height:100dvh;border:0;border-radius:0}.vocal-stage h1{font-size:38px}.actions{display:grid}.actions button,.actions a{width:100%}}`;
