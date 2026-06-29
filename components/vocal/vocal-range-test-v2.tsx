'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Mic2, Play, RefreshCw, Save, Sparkles } from 'lucide-react';
import { autoCorrelate, classifyVoice, frequencyToMidi, midiToFrequency, midiToBrazilianNoteName, formatBrazilianNote } from '@/lib/audio/pitch';
import { VocalNoteMeter } from './vocal-note-meter';

type Captured = { note: string; midi: number; frequency: number };
type Gender = 'masculino' | 'feminino' | 'nao_informar';
type Step = 'intro' | 'lowest' | 'confirm-range' | 'tess-high' | 'tess-low' | 'gender' | 'result';
type Props = { profileId: string; authUserId?: string | null; initialProfile?: any };

type AudioHandle = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  stream: MediaStream;
  raf: number;
  data: Float32Array;
  lastMidi: number | null;
  lastAcceptedAt: number;
  recent: number[];
};

function rmsFromBuffer(data: Float32Array) {
  let sum = 0;
  for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
  return Math.sqrt(sum / data.length);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function capturedFromMidi(midi: number, frequency?: number): Captured {
  return { midi, note: midiToBrazilianNoteName(midi), frequency: frequency || midiToFrequency(midi) };
}

export function VocalRangeTestV2({ profileId, authUserId, initialProfile }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [micError, setMicError] = useState('');
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null);
  const [currentMidi, setCurrentMidi] = useState<number | null>(null);
  const [stableMidi, setStableMidi] = useState<number | null>(null);
  const [captureReview, setCaptureReview] = useState(false);
  const [showRangeGuide, setShowRangeGuide] = useState(false);
  const [rangeListening, setRangeListening] = useState(false);
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

  const result = useMemo(() => classifyVoice({ tessituraLowMidi: tessLow, tessituraHighMidi: tessHigh, lowestMidi: lowest?.midi, highestMidi: highest?.midi, gender }), [tessLow, tessHigh, lowest, highest, gender]);
  const validation = useMemo(() => {
    if (!lowest || !highest || tessLow == null || tessHigh == null) return 'Complete todas as etapas para gerar seu mapa vocal.';
    if (lowest.midi > highest.midi) return 'A nota grave ficou acima da nota aguda. Refaça a avaliação.';
    if (tessLow < lowest.midi) return 'A tessitura grave ficou fora da extensão capturada. Refaça essa etapa.';
    if (tessHigh > highest.midi) return 'A tessitura aguda ficou fora da extensão capturada. Refaça essa etapa.';
    if (tessLow > tessHigh) return 'A tessitura grave ficou acima da aguda. Refaça a avaliação.';
    return '';
  }, [lowest, highest, tessLow, tessHigh]);

  function prepareRangeCapture({ reset = true }: { reset?: boolean } = {}) {
    stopMic();
    setMicError('');
    setCaptureReview(false);
    setRangeListening(false);
    if (reset) {
      setLowest(null);
      setHighest(null);
      setCurrentFrequency(null);
      setCurrentMidi(null);
      setStableMidi(null);
    }
    setStep('lowest');
    setShowRangeGuide(true);
  }

  async function beginRangeCapture() {
    setShowRangeGuide(false);
    setRangeListening(true);
    setMicError('');
    setLowest(null);
    setHighest(null);
    setCurrentFrequency(null);
    setCurrentMidi(null);
    setStableMidi(null);
    try { await openPitchMonitor(); } catch { setRangeListening(false); setMicError('Não conseguimos acessar seu microfone. Verifique as permissões do navegador.'); }
  }

  async function openPitchMonitor() {
    if (audioRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtor({ latencyHint: 'interactive' });
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const handle: AudioHandle = { ctx, analyser, stream, raf: 0, data, lastMidi: null, lastAcceptedAt: 0, recent: [] };

    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      const volume = rmsFromBuffer(data);
      const isTessitura = stepRef.current === 'tess-high' || stepRef.current === 'tess-low';
      const minVolume = isTessitura ? 0.0045 : 0.0035;

      if (volume < minVolume) {
        if (performance.now() - handle.lastAcceptedAt > 160) {
          setCurrentFrequency(null);
          setCurrentMidi(null);
          handle.recent = [];
        }
        handle.raf = requestAnimationFrame(tick);
        return;
      }

      const freq = autoCorrelate(data, ctx.sampleRate);
      if (freq && freq > 55 && freq < 1800) {
        const rawMidi = frequencyToMidi(freq);
        handle.recent = [...handle.recent.slice(-3), rawMidi];
        const smoothedMidi = median(handle.recent) ?? rawMidi;
        const isJump = handle.lastMidi != null && Math.abs(smoothedMidi - handle.lastMidi) > 10;
        if (!isJump) {
          handle.lastMidi = smoothedMidi;
          handle.lastAcceptedAt = performance.now();
          setCurrentFrequency(midiToFrequency(smoothedMidi));
          setCurrentMidi(smoothedMidi);
          setStableMidi(smoothedMidi);
          const item = capturedFromMidi(smoothedMidi, freq);
          if (stepRef.current === 'lowest' && rangeListening && !captureReview) {
            setLowest((old) => !old || item.midi < old.midi ? item : old);
            setHighest((old) => !old || item.midi > old.midi ? item : old);
          }
        }
      }
      handle.raf = requestAnimationFrame(tick);
    };

    audioRef.current = handle;
    handle.raf = requestAnimationFrame(tick);
  }

  async function startTessituraMonitor() {
    if (audioRef.current) return;
    setMicError('');
    try { await openPitchMonitor(); } catch { setMicError('Ative o microfone para validar sua afinação em tempo real.'); }
  }

  useEffect(() => {
    stepRef.current = step;
    if (step !== 'lowest') setCaptureReview(false);
    if (step === 'tess-high' || step === 'tess-low') void startTessituraMonitor();
    else if (step !== 'lowest') { stopMic(); setCurrentFrequency(null); setCurrentMidi(null); setStableMidi(null); }
  }, [step]);
  useEffect(() => { document.body.classList.toggle('vocal-capture-active', step === 'lowest'); return () => document.body.classList.remove('vocal-capture-active'); }, [step]);
  useEffect(() => () => stopMic(), []);

  function stopMic() {
    const a = audioRef.current;
    if (!a) return;
    cancelAnimationFrame(a.raf);
    a.stream.getTracks().forEach((t) => t.stop());
    a.ctx.close();
    audioRef.current = null;
  }

  async function playNote(midi: number) {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtor();
    await ctx.resume();
    const now = ctx.currentTime;
    const duration = 3.1;
    const output = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    output.gain.setValueAtTime(0.0001, now);
    output.gain.exponentialRampToValueAtTime(0.28, now + 0.025);
    output.gain.exponentialRampToValueAtTime(0.12, now + 0.45);
    output.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    compressor.threshold.value = -20; compressor.knee.value = 24; compressor.ratio.value = 5; compressor.attack.value = 0.003; compressor.release.value = 0.18;
    output.connect(compressor).connect(ctx.destination);
    const base = midiToFrequency(midi);
    [{ ratio: 1, gain: 0.95, detune: 0, type: 'triangle' as OscillatorType }, { ratio: 2, gain: 0.34, detune: -4, type: 'sine' as OscillatorType }, { ratio: 3, gain: 0.17, detune: 5, type: 'sine' as OscillatorType }, { ratio: 4, gain: 0.08, detune: -8, type: 'triangle' as OscillatorType }].forEach(({ ratio, gain, detune, type }) => {
      const osc = ctx.createOscillator(); const amp = ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(base * ratio, now); osc.detune.setValueAtTime(detune, now);
      amp.gain.setValueAtTime(0.0001, now); amp.gain.exponentialRampToValueAtTime(gain, now + 0.012); amp.gain.exponentialRampToValueAtTime(gain * 0.38, now + 0.38); amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp).connect(output); osc.start(now); osc.stop(now + duration + 0.05);
    });
    window.setTimeout(() => ctx.close().catch(() => undefined), (duration + 0.25) * 1000);
  }

  function resetAll() { setLowest(null); setHighest(null); setTessHigh(null); setTessLow(null); setSaveMessage(''); setTessituraSteps([]); setCaptureReview(false); setShowRangeGuide(false); setRangeListening(false); setStep('intro'); stopMic(); }
  function finishMapping() { if (!lowest || !highest || captureReview) return; stopMic(); setRangeListening(false); setCaptureReview(true); }
  function retryMapping() { prepareRangeCapture({ reset: true }); }
  function confirmRangeAndGoToTessitura() { if (!lowest || !highest) return; stopMic(); setTessHigh(highest.midi); setTessLow(lowest.midi); setStep('tess-high'); }
  async function save() {
    if (validation) { setSaveMessage(validation); return; }
    setSaving(true); setSaveMessage('');
    const payload = { profileId, authUserId, lowest, highest, tessituraLowMidi: tessLow, tessituraHighMidi: tessHigh, gender, classification: result.classification, confidence: result.confidence, tessituraSteps, userAgent: navigator.userAgent };
    const response = await fetch('/api/vocal-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSaving(false);
    setSaveMessage(response.ok ? 'Mapa Vocal salvo no seu perfil.' : 'Não foi possível salvar agora. Tente novamente.');
  }

  const captureReady = Boolean(lowest && highest);
  const captureRange = lowest && highest ? `${lowest.note} — ${highest.note}` : '—';
  const liveNote = currentMidi != null ? midiToBrazilianNoteName(currentMidi) : '—';
  const highTuner = getTunerState(currentFrequency, tessHigh);
  const lowTuner = getTunerState(currentFrequency, tessLow);

  return <div className="vocal-test-shell">
    <style>{css}</style>
    {step === 'intro' && <section className="vocal-stage hero"><Sparkles size={34} /><h1>Vamos criar seu Mapa Vocal</h1><p>Esse teste identifica sua extensão, sua tessitura confortável e uma tendência vocal aproximada.</p><p className="tip">Não force. Técnica vocal é consciência, não violência.</p>{micError && <strong className="error">{micError}</strong>}<button onClick={() => prepareRangeCapture()} aria-label="Iniciar avaliação vocal"><Mic2 /> Iniciar avaliação</button></section>}
    {step === 'lowest' && <section className="vocal-stage grid range-capture"><div className="range-desktop-ui"><VocalNoteMeter currentMidi={currentMidi} lowestMidi={lowest?.midi} highestMidi={highest?.midi} /><div className="range-copy"><p className="eyebrow">ETAPA 1/3</p><h1>Mapeie sua extensão vocal</h1><p className="range-helper">Cante sua nota mais grave e depois sua nota mais aguda. A régua marca os extremos.</p>{captureReview && <div className="capture-result"><span>Extensão captada</span><strong>{captureRange}</strong><small>Confirme para seguir ou tente novamente.</small></div>}{micError && <strong className="error">{micError}</strong>}<div className="actions"><button disabled={!captureReady} onClick={(event) => { event.stopPropagation(); captureReview ? confirmRangeAndGoToTessitura() : finishMapping(); }}>{captureReview ? 'Confirmar extensão' : 'Pressione quando terminar'}</button><button onClick={(event) => { event.stopPropagation(); retryMapping(); }}><RefreshCw /> Tentar de novo</button></div></div></div><MobileRangeCapture currentMidi={currentMidi} lowestMidi={lowest?.midi} highestMidi={highest?.midi} liveNote={liveNote} captureReady={captureReady} captureReview={captureReview} captureRange={captureRange} showGuide={showRangeGuide} onStart={beginRangeCapture} onBack={resetAll} onRetry={retryMapping} onPrimary={() => captureReview ? confirmRangeAndGoToTessitura() : finishMapping()} /></section>}
    {step === 'tess-high' && highest && tessHigh != null && <Tessitura title="Tessitura vocal" text="Agora vamos encontrar seu agudo confortável. Repita a palavra na nota sugerida." midi={tessHigh} phrase="eu consigo" instruction="Cante a palavra na nota sugerida" downLabel="Quero descer a nota" tuner={highTuner} onPlay={playNote} onMove={() => { setTessHigh(Math.max(lowest?.midi ?? 24, tessHigh - 1)); setTessituraSteps((s) => [...s, { area: 'high', action: 'down', midi: tessHigh - 1 }]); }} onConfirm={() => setStep('tess-low')} onExit={resetAll} />}
    {step === 'tess-low' && lowest && tessLow != null && <Tessitura title="Tessitura vocal" text="Agora vamos encontrar seu grave confortável. Repita a palavra na nota sugerida." midi={tessLow} phrase="eu consigo" instruction="Cante a palavra na nota sugerida" downLabel="Quero subir a nota" icon="up" tuner={lowTuner} onPlay={playNote} onMove={() => { setTessLow(Math.min(highest?.midi ?? 96, tessLow + 1)); setTessituraSteps((s) => [...s, { area: 'low', action: 'up', midi: tessLow + 1 }]); }} onConfirm={() => setStep('gender')} onExit={resetAll} />}
    {step === 'gender' && <section className="vocal-stage hero"><h1>Selecione uma referência vocal</h1><p>Essa informação ajuda apenas a estimar melhor a tendência vocal.</p><div className="choice-grid">{[['masculino','Masculino'],['feminino','Feminino'],['nao_informar','Prefiro não informar']].map(([value,label]) => <button className={gender === value ? 'selected' : ''} key={value} onClick={() => setGender(value as Gender)}>{label}</button>)}</div><button onClick={() => setStep('result')}>Ver resultado</button></section>}
    {step === 'result' && lowest && highest && <section className="vocal-stage hero result"><h1>Seu Mapa Vocal</h1><div className="result-grid"><article><span>Extensão</span><strong>{lowest.note} → {highest.note}</strong></article><article><span>Tessitura confortável</span><strong>{tessLow != null ? midiToBrazilianNoteName(tessLow) : '—'} → {tessHigh != null ? midiToBrazilianNoteName(tessHigh) : '—'}</strong></article><article><span>Tendência vocal</span><strong>{result.classification}</strong></article><article><span>Confiança</span><strong>{Math.round(result.confidence * 100)}%</strong></article></div><p>Essa é uma leitura inicial. Sua voz pode evoluir conforme técnica, saúde vocal, aquecimento, consciência corporal e treino.</p>{validation && <strong className="error">{validation}</strong>}{saveMessage && <strong className="save-message">{saveMessage}</strong>}<div className="actions"><button disabled={saving || Boolean(validation)} onClick={save}><Save /> {saving ? 'Salvando...' : 'Salvar no meu perfil'}</button><button onClick={resetAll}><RefreshCw /> Refazer avaliação</button><Link href="/aluno/biblioteca">Ver aulas recomendadas</Link></div></section>}
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
  if (pitchClassCents < -55) return { cents: pitchClassCents, x, status: 'low', label: 'Abaixo da nota' };
  if (pitchClassCents < -7) return { cents: pitchClassCents, x, status: 'almost-low', label: abs <= 18 ? 'Quase no centro' : 'Um pouco abaixo' };
  if (pitchClassCents > 55) return { cents: pitchClassCents, x, status: 'high', label: 'Acima da nota' };
  return { cents: pitchClassCents, x, status: 'almost-high', label: abs <= 18 ? 'Quase no centro' : 'Um pouco acima' };
}

function mobileGlowFromMidi(midi?: number | null) { if (midi == null) return { region: 'chest', top: 54, left: 53, width: 29, height: 17 }; if (midi >= 72) return { region: 'head', top: 21, left: 55, width: 18, height: 12 }; if (midi >= 55) return { region: 'mix', top: 36, left: 54, width: 23, height: 15 }; return { region: 'chest', top: 54, left: 53, width: 29, height: 17 }; }

function MobileRangeCapture({ currentMidi, lowestMidi, highestMidi, liveNote, captureReady, captureReview, captureRange, showGuide, onStart, onBack, onRetry, onPrimary }: any) {
  const minMidi = 24; const maxMidi = 96; const clamp = (midi: number) => Math.max(minMidi, Math.min(maxMidi, midi)); const percent = (midi: number) => 100 - ((clamp(midi) - minMidi) / (maxMidi - minMidi)) * 100; const labels = Array.from({ length: Math.floor((maxMidi - minMidi) / 4) + 1 }, (_, index) => maxMidi - index * 4); const glow = mobileGlowFromMidi(currentMidi);
  return <div className="mvr-shell"><div className="mvr-ruler"><div className="mvr-line" />{labels.map((midi) => <span key={midi} className={midi % 12 === 0 ? 'octave' : ''} style={{ top: `${percent(midi)}%` }}>{midiToBrazilianNoteName(midi)}</span>)}{highestMidi != null && <b className="mvr-limit mvr-limit-high" style={{ top: `${percent(highestMidi)}%` }}><em>{midiToBrazilianNoteName(highestMidi)}</em></b>}{lowestMidi != null && <b className="mvr-limit mvr-limit-low" style={{ top: `${percent(lowestMidi)}%` }}><em>{midiToBrazilianNoteName(lowestMidi)}</em></b>}{currentMidi != null && <i className="mvr-dot" style={{ top: `${percent(currentMidi)}%` }} />}</div><div className="mvr-visual"><div className="mvr-aura" /><img src="/vocal/vocal-body-base.png" alt="Silhueta vocal" draggable={false} /><b className={`mvr-glow ${glow.region}`} style={{ top: `${glow.top}%`, left: `${glow.left}%`, width: `${glow.width}%`, height: `${glow.height}%` }} /><span className="head">CABEÇA</span><span className="mix">VOZ MISTA</span><span className="chest">PEITO</span></div><header><small>ETAPA 1/3</small><h1>Mapeie sua extensão vocal</h1><p>Cante do grave ao agudo. A régua marca os extremos.</p></header><div className="mvr-note"><small>NOTA ATUAL</small><strong>{liveNote}</strong></div>{captureReview && <div className="mvr-result"><span>Extensão captada</span><strong>{captureRange}</strong></div>}{showGuide && <div className="mvr-guide"><div><small>ANTES DE COMEÇAR</small><h2>Mapeie sua extensão vocal</h2><p>Cante a sua nota mais grave e depois cante a sua nota mais aguda. Não force: queremos apenas registrar seus extremos com segurança.</p><button onClick={onStart}><Mic2 size={18} /> Iniciar</button></div></div>}<button className="mvr-back" onClick={onBack} aria-label="Sair">←</button><button className="mvr-main" disabled={!captureReady} onClick={onPrimary}>{captureReview ? 'Confirmar extensão' : 'Pressione quando terminar'}</button><button className="mvr-retry" onClick={onRetry} aria-label="Tentar de novo"><RefreshCw /></button></div>;
}

function Tessitura({ title, text, midi, phrase, instruction, downLabel, icon, tuner, onPlay, onMove, onConfirm, onExit }: any) {
  const note = midiToBrazilianNoteName(midi);
  return <section className="vocal-stage tessitura-stage"><button type="button" className="tessitura-exit" onClick={onExit} aria-label="Voltar">‹</button><div className="tessitura-figure" aria-hidden="true"><img src="/vocal/vocal-body-base.png" alt="" draggable={false} /><span /></div><div className="tessitura-copy"><p className="tessitura-step">ETAPA 2/3</p><h1>{title}</h1><p className="tessitura-lead">{text}</p><div className="tessitura-note-card"><div><span>NOTA SUGERIDA</span><strong>{note}</strong></div><button type="button" onClick={() => onPlay(midi)}><Play /><b>{note}</b><small>Tocar nota</small></button></div><div className="tessitura-sing-card"><i><Mic2 size={28} /></i><div><strong>{instruction || 'Cante a palavra na nota sugerida'}</strong><p>Diga “{phrase || 'eu consigo'}” com qualidade e conforto.</p></div></div><div className={`tessitura-tuner ${tuner?.status || 'waiting'}`} style={{ '--tuner-x': `${tuner?.x ?? 50}%` } as any}><span>MONITORAMENTO DE AFINAÇÃO</span><div className="tessitura-scale"><b /><i /></div><div className="tessitura-scale-labels"><small>Abaixo</small><small>Na nota</small><small>Acima</small></div><p><Check size={18} /> {tuner?.label || 'Cante para validar a nota'}</p></div><div className="actions tessitura-actions"><button onClick={onConfirm}><Check /> Consegui com conforto</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} Difícil / sem qualidade</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} {downLabel}</button></div><div className="tessitura-tip"><Sparkles size={20} /><p>Dica: mantenha o volume moderado e foque na qualidade do som.</p></div></div></section>;
}

const css = `
.vocal-test-shell{min-height:100dvh;padding:18px 14px 110px;color:#fff;background:#050507}.vocal-stage{max-width:1120px;margin:0 auto;border:1px solid rgba(255,255,255,.12);border-radius:30px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.45);padding:24px}.vocal-stage.hero{text-align:center;display:grid;gap:18px;place-items:center}.range-desktop-ui{display:grid;grid-template-columns:minmax(360px,1.12fr) minmax(0,.88fr);gap:22px;align-items:stretch}.range-copy{align-self:center}.vocal-stage h1{margin:0;font-size:clamp(34px,7vw,58px);letter-spacing:-.06em}.vocal-stage p{margin:0;color:rgba(255,255,255,.72);font-size:18px;line-height:1.45}.eyebrow{color:#67e8f9!important;font-size:12px!important;text-transform:uppercase;letter-spacing:.18em;font-weight:1000}.tip,.vocal-stage small{color:#f5c76b!important}.vocal-stage button,.vocal-stage a{border:0;border-radius:18px;padding:15px 18px;background:linear-gradient(180deg,#ffe29a,#e8ad34);color:#120d05;font-weight:950;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px}.actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.actions button:nth-child(n+2){background:rgba(255,255,255,.09);color:#fff;border:1px solid rgba(255,255,255,.12)}.range-big{font-size:54px;font-weight:1000;letter-spacing:-.05em;color:#67e8f9}.choice-grid,.result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:760px}.result-grid{grid-template-columns:repeat(2,1fr)}.result-grid article{border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:18px;background:rgba(0,0,0,.25)}.result-grid span{display:block;color:rgba(255,255,255,.62);margin-bottom:7px}.result-grid strong{font-size:24px}.mvr-shell{display:none}body.vocal-capture-active{overflow:hidden!important}body.vocal-capture-active nav,body.vocal-capture-active footer,body.vocal-capture-active [class*="bottom"],body.vocal-capture-active [class*="Bottom"],body.vocal-capture-active [class*="tab-bar"],body.vocal-capture-active [class*="TabBar"],body.vocal-capture-active [class*="mobile-nav"],body.vocal-capture-active [class*="MobileNav"]{display:none!important}
@media(max-width:760px){.vocal-test-shell{padding:0;background:#020304;min-height:100dvh;overflow:hidden}.range-capture{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#020304!important;box-shadow:none!important;overflow:hidden!important;z-index:2147483647!important}.range-desktop-ui{display:none!important}.mvr-shell{display:block;position:absolute;inset:0;background:#020304;color:#fff;overflow:hidden}.choice-grid,.result-grid{grid-template-columns:1fr}.mvr-ruler{position:absolute;left:6.1%;top:21.5%;bottom:14.5%;width:30%;z-index:4}.mvr-line{position:absolute;left:61%;top:0;bottom:0;width:6px;border-radius:999px;background:linear-gradient(#67e8f9 0 43%,#f5c76b 43%)}.mvr-ruler span{position:absolute;left:0;transform:translateY(-50%);font-size:12px;font-weight:900;color:rgba(255,255,255,.58);line-height:1}.mvr-ruler span:after{content:"";position:absolute;left:64px;top:50%;width:42px;height:1px;background:rgba(255,255,255,.22)}.mvr-dot{position:absolute;left:47%;width:70px;height:70px;border-radius:50%;transform:translate(-50%,-50%);background:#67e8f9;box-shadow:0 0 32px rgba(103,232,249,.7);z-index:5;transition:top 45ms linear}.mvr-limit{position:absolute;left:62%;width:120px;height:4px;border-radius:999px;transform:translateY(-50%);z-index:6}.mvr-limit em{position:absolute;left:126px;top:50%;transform:translateY(-50%);font-style:normal;font-weight:1000;color:#fff;white-space:nowrap}.mvr-limit-high{background:#67e8f9}.mvr-limit-low{background:#f5c76b}.mvr-visual{position:absolute;left:24%;right:-3%;top:23%;bottom:20%;z-index:1}.mvr-visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:.78}.mvr-aura{position:absolute;inset:8% 8%;border-radius:50%;background:radial-gradient(circle,rgba(103,232,249,.12),transparent 62%);filter:blur(14px)}.mvr-glow{position:absolute;border-radius:50%;background:rgba(103,232,249,.32);filter:blur(20px);opacity:.72}.mvr-visual span{position:absolute;right:0;font-size:18px;font-weight:1000;letter-spacing:.04em;color:rgba(255,255,255,.66)}.mvr-visual .head{top:20%}.mvr-visual .mix{top:36%}.mvr-visual .chest{top:52%;color:#f5c76b} .mvr-shell header{position:absolute;left:10%;right:10%;top:10%;text-align:center;z-index:8}.mvr-shell header small{display:block;font-size:14px;letter-spacing:.18em;color:rgba(255,255,255,.55)!important;font-weight:1000}.mvr-shell header h1{font-size:34px;line-height:.95;margin:14px 0 10px;letter-spacing:-.06em}.mvr-shell header p{font-size:18px;color:rgba(255,255,255,.64)}.mvr-note{position:absolute;left:33%;right:33%;bottom:23%;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.58);border-radius:28px;padding:13px 10px;text-align:center;z-index:7}.mvr-note small{display:block;color:rgba(255,255,255,.64)!important;letter-spacing:.18em;font-weight:1000}.mvr-note strong{font-size:54px;line-height:1;color:#67e8f9}.mvr-main{position:absolute;left:25%;right:25%;bottom:14%;z-index:8;border-radius:999px!important}.mvr-back,.mvr-retry{position:absolute;bottom:14%;width:64px;height:64px;border-radius:50%!important;background:rgba(255,255,255,.08)!important;color:#fff!important;border:1px solid rgba(255,255,255,.14)!important;z-index:8}.mvr-back{left:8%}.mvr-retry{right:8%}.mvr-result{position:absolute;left:20%;right:20%;bottom:31%;padding:14px;border-radius:22px;background:rgba(0,0,0,.72);border:1px solid rgba(245,199,107,.35);text-align:center;z-index:8}.mvr-result span{display:block;color:#f5c76b;font-weight:1000;text-transform:uppercase;letter-spacing:.12em;font-size:12px}.mvr-result strong{font-size:24px}.mvr-guide{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.56);backdrop-filter:blur(8px);z-index:20;padding:24px}.mvr-guide>div{max-width:330px;border:1px solid rgba(255,255,255,.16);border-radius:26px;background:linear-gradient(145deg,rgba(255,255,255,.12),rgba(255,255,255,.06));padding:22px;text-align:center;box-shadow:0 28px 90px rgba(0,0,0,.55)}.mvr-guide small{display:block;color:#f5c76b!important;font-weight:1000;letter-spacing:.16em}.mvr-guide h2{margin:8px 0;font-size:25px;letter-spacing:-.04em}.mvr-guide p{font-size:15px;color:rgba(255,255,255,.76);line-height:1.45;margin:0 0 16px}.mvr-guide button{width:100%;border-radius:999px!important}.tessitura-stage{min-height:100dvh;display:grid;grid-template-columns:.9fr 1.1fr;gap:22px;align-items:center}.tessitura-figure{position:relative;min-height:560px}.tessitura-figure img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:.72}.tessitura-copy{display:grid;gap:16px}.tessitura-step{color:#f5c76b!important;letter-spacing:.16em;font-weight:1000;text-transform:uppercase}.tessitura-note-card,.tessitura-sing-card,.tessitura-tuner,.tessitura-tip{border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(0,0,0,.25);padding:16px}.tessitura-note-card{display:flex;justify-content:space-between;gap:14px;align-items:center}.tessitura-note-card span{color:rgba(255,255,255,.56);font-size:12px;font-weight:1000;letter-spacing:.13em}.tessitura-note-card strong{font-size:44px;color:#67e8f9}.tessitura-sing-card{display:flex;gap:14px;align-items:center}.tessitura-tuner .tessitura-scale{height:10px;border-radius:999px;background:linear-gradient(90deg,#f87171,#f5c76b,#67e8f9,#f5c76b,#f87171);position:relative}.tessitura-tuner .tessitura-scale i{position:absolute;left:var(--tuner-x);top:50%;width:22px;height:22px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);box-shadow:0 0 18px rgba(255,255,255,.5)}.tessitura-scale-labels{display:flex;justify-content:space-between}.tessitura-exit{position:absolute;left:18px;top:18px;border-radius:999px!important;background:rgba(255,255,255,.08)!important;color:#fff!important;z-index:5}@media(max-width:760px){.tessitura-stage{grid-template-columns:1fr;padding:72px 18px 24px}.tessitura-figure{display:none}.tessitura-note-card strong{font-size:38px}.mvr-note{left:32%;right:32%;bottom:24%}.mvr-note strong{font-size:48px}.mvr-main{left:25%;right:25%;bottom:14%}}}
`;
