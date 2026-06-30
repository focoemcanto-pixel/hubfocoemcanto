'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Mic2, Play, RefreshCw, Save, Sparkles } from 'lucide-react';
import { classifyVoice, detectPitch, midiToFrequency, midiToBrazilianNoteName, formatBrazilianNote } from '@/lib/audio/pitch';
import { playPianoSample, preloadPianoSamples, stopPianoSamples } from '@/lib/audio/piano-sample-engine';
import { VocalNoteMeter } from './vocal-note-meter';

type Captured = { note: string; midi: number; frequency: number };
type Gender = 'masculino' | 'feminino' | 'nao_informar';
type Step = 'intro' | 'lowest' | 'confirm-range' | 'tess-high' | 'tess-low' | 'gender' | 'result';
type Props = { profileId: string; authUserId?: string | null; initialProfile?: any };
type AudioState = { ctx: AudioContext; analyser: AnalyserNode; stream: MediaStream; raf: number; data: Float32Array; lastAcceptedAt: number; lastFrame: { midiFloat: number; frequencyHz: number } | null };

function capturedFromMidi(midiFloat: number, frequency?: number): Captured {
  const midi = Math.round(midiFloat);
  return { midi, note: midiToBrazilianNoteName(midi), frequency: frequency || midiToFrequency(midiFloat) };
}

export function VocalRangeTest({ profileId, authUserId, initialProfile }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [micError, setMicError] = useState('');
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null);
  const [currentMidi, setCurrentMidi] = useState<number | null>(null);
  const [stableMidi, setStableMidi] = useState<number | null>(null);
  const [captureReview, setCaptureReview] = useState(false);
  const [lowest, setLowest] = useState<Captured | null>(initialProfile?.lowest_midi ? { note: formatBrazilianNote(initialProfile.lowest_midi ?? initialProfile.lowest_note), midi: initialProfile.lowest_midi, frequency: Number(initialProfile.lowest_frequency || midiToFrequency(initialProfile.lowest_midi)) } : null);
  const [highest, setHighest] = useState<Captured | null>(initialProfile?.highest_midi ? { note: formatBrazilianNote(initialProfile.highest_midi ?? initialProfile.highest_note), midi: initialProfile.highest_midi, frequency: Number(initialProfile.highest_frequency || midiToFrequency(initialProfile.highest_midi)) } : null);
  const [tessHigh, setTessHigh] = useState<number | null>(initialProfile?.tessitura_high_midi ?? null);
  const [tessLow, setTessLow] = useState<number | null>(initialProfile?.tessitura_low_midi ?? null);
  const [gender, setGender] = useState<Gender>((initialProfile?.gender as Gender) || 'nao_informar');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [tessituraSteps, setTessituraSteps] = useState<any[]>([]);
  const audioRef = useRef<AudioState | null>(null);
  const stepRef = useRef<Step>(step);
  const stableRef = useRef<{ midi: number | null; since: number }>({ midi: null, since: 0 });
  const referenceBlockUntilRef = useRef(0);

  const result = useMemo(() => classifyVoice({ tessituraLowMidi: tessLow, tessituraHighMidi: tessHigh, lowestMidi: lowest?.midi, highestMidi: highest?.midi, gender }), [tessLow, tessHigh, lowest, highest, gender]);
  const validation = useMemo(() => {
    if (!lowest || !highest || tessLow == null || tessHigh == null) return 'Complete todas as etapas para gerar seu mapa vocal.';
    if (lowest.midi > highest.midi) return 'A nota grave ficou acima da nota aguda. Refaça a avaliação.';
    if (tessLow < lowest.midi) return 'A tessitura grave ficou fora da extensão capturada. Refaça essa etapa.';
    if (tessHigh > highest.midi) return 'A tessitura aguda ficou fora da extensão capturada. Refaça essa etapa.';
    if (tessLow > tessHigh) return 'A tessitura grave ficou acima da aguda. Refaça a avaliação.';
    return '';
  }, [lowest, highest, tessLow, tessHigh]);

  async function startMic({ reset = true }: { reset?: boolean } = {}) {
    setMicError('');
    if (audioRef.current) stopMic();
    if (reset) {
      setLowest(null);
      setHighest(null);
      setCurrentFrequency(null);
      setCurrentMidi(null);
      setStableMidi(null);
      stableRef.current = { midi: null, since: 0 };
    }
    setCaptureReview(false);
    try {
      await openPitchMonitor();
      setStep('lowest');
    } catch {
      setMicError('Não conseguimos acessar seu microfone. Verifique as permissões do navegador.');
    }
  }

  async function openPitchMonitor() {
    if (audioRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: 48000 } });
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtor({ latencyHint: 'interactive', sampleRate: 48000 });
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const handle: AudioState = { ctx, analyser, stream, raf: 0, data, lastAcceptedAt: 0, lastFrame: null };

    const tick = () => {
      const now = performance.now();
      const isTessitura = stepRef.current === 'tess-high' || stepRef.current === 'tess-low';
      if (isTessitura && now < referenceBlockUntilRef.current) {
        setCurrentFrequency(null);
        setCurrentMidi(null);
        handle.raf = requestAnimationFrame(tick);
        return;
      }

      analyser.getFloatTimeDomainData(data);
      const pitch = detectPitch(data, ctx.sampleRate);
      const frame = pitch ? { midiFloat: pitch.midiFloat, frequencyHz: pitch.frequencyHz } : null;
      const holding = !frame && handle.lastFrame && now - handle.lastAcceptedAt < 180;
      const activeFrame = frame || (holding ? handle.lastFrame : null);

      if (frame) {
        handle.lastFrame = frame;
        handle.lastAcceptedAt = now;
      }

      if (activeFrame) {
        const midiFloat = activeFrame.midiFloat;
        const midiRounded = Math.round(midiFloat);
        setCurrentFrequency(activeFrame.frequencyHz);
        setCurrentMidi(midiFloat);
        if (stableRef.current.midi === midiRounded) {
          if (now - stableRef.current.since > (isTessitura ? 70 : 180)) {
            setStableMidi(midiRounded);
            if (stepRef.current === 'lowest' && frame) {
              const item = capturedFromMidi(midiFloat, activeFrame.frequencyHz);
              setLowest((old) => !old || item.midi < old.midi ? item : old);
              setHighest((old) => !old || item.midi > old.midi ? item : old);
            }
          }
        } else stableRef.current = { midi: midiRounded, since: now };
      } else {
        setCurrentFrequency(null);
        setCurrentMidi(null);
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
    else if (step !== 'lowest') {
      stopMic();
      setCurrentFrequency(null);
      setCurrentMidi(null);
      setStableMidi(null);
    }
  }, [step]);
  useEffect(() => { document.body.classList.toggle('vocal-capture-active', step === 'lowest'); return () => document.body.classList.remove('vocal-capture-active'); }, [step]);
  useEffect(() => () => stopMic(), []);

  function stopMic() {
    const a = audioRef.current;
    if (!a) return;
    cancelAnimationFrame(a.raf);
    a.stream.getTracks().forEach((t) => t.stop());
    a.ctx.close().catch(() => undefined);
    audioRef.current = null;
  }

  async function playNote(midi: number) {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtor({ latencyHint: 'interactive' });
    await ctx.resume();
    stopPianoSamples(ctx);
    referenceBlockUntilRef.current = performance.now() + 1800;
    setCurrentFrequency(null);
    setCurrentMidi(null);
    await preloadPianoSamples(ctx, [midi]).catch(() => undefined);
    const now = ctx.currentTime;
    await playPianoSample(ctx, midi, now + 0.02, now + 3.8, 0.92);
    window.setTimeout(() => ctx.close().catch(() => undefined), 5200);
  }

  function resetAll() { setLowest(null); setHighest(null); setTessHigh(null); setTessLow(null); setSaveMessage(''); setTessituraSteps([]); setCaptureReview(false); setStep('intro'); stopMic(); }
  function finishMapping() { if (!lowest || !highest || captureReview) return; stopMic(); setCaptureReview(true); }
  function retryMapping() { setCaptureReview(false); startMic({ reset: true }); }
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
  const highTuner = getTunerState(currentMidi, tessHigh);
  const lowTuner = getTunerState(currentMidi, tessLow);

  return <div className="vocal-test-shell">
    <style>{css}</style>
    {step === 'intro' && <section className="vocal-stage hero vocal-intro-premium"><div className="vocal-intro-icon"><Sparkles size={34} /></div><h1>Descubra o <span>potencial da sua voz</span></h1><p className="vocal-intro-copy">Este teste analisa sua extensão, tessitura confortável e tendência vocal para criar seu Mapa Vocal personalizado.</p><p className="vocal-intro-safe"><b>◇</b>Não force. Técnica vocal é consciência, não violência.</p><div className="vocal-intro-orbit"><Mic2 /></div><div className="vocal-intro-benefits"><div><strong>Extensão</strong><small>Grave e agudo</small></div><div><strong>Tessitura</strong><small>Zona confortável</small></div><div><strong>Tendência</strong><small>Perfil vocal</small></div><div><strong>Evolução</strong><small>Acompanhe</small></div></div>{micError && <strong className="error">{micError}</strong>}<button className="vocal-intro-cta" onClick={() => startMic()} aria-label="Iniciar avaliação vocal"><Mic2 /><span><strong>Iniciar avaliação</strong><small>Leva cerca de 3 a 5 minutos</small></span></button><p className="vocal-intro-private">Seus dados são privados e seguros</p></section>}
    {step === 'lowest' && <section className="vocal-stage grid range-capture"><div className="range-desktop-ui"><VocalNoteMeter currentMidi={currentMidi} lowestMidi={lowest?.midi} highestMidi={highest?.midi} /><div className="range-copy"><p className="eyebrow">ETAPA 1/3</p><h1>Mapeie sua extensão vocal</h1><p className="range-helper">Cante do grave ao agudo. A régua marca os extremos.</p>{captureReview && <div className="capture-result"><span>Extensão captada</span><strong>{captureRange}</strong><small>Confirme para seguir ou tente novamente.</small></div>}<div className="actions"><button disabled={!captureReady} onClick={(event) => { event.stopPropagation(); captureReview ? confirmRangeAndGoToTessitura() : finishMapping(); }}>{captureReview ? 'Confirmar extensão' : 'Pressione quando terminar'}</button><button onClick={(event) => { event.stopPropagation(); retryMapping(); }}><RefreshCw /> Tentar de novo</button></div></div></div><MobileRangeCapture currentMidi={currentMidi} lowestMidi={lowest?.midi} highestMidi={highest?.midi} liveNote={liveNote} captureReady={captureReady} captureReview={captureReview} captureRange={captureRange} onBack={resetAll} onRetry={retryMapping} onPrimary={() => captureReview ? confirmRangeAndGoToTessitura() : finishMapping()} /></section>}
    {step === 'confirm-range' && lowest && highest && <section className="vocal-stage hero"><h1>Confirmar alcance vocal?</h1><div className="range-big">{lowest.note} ↔ {highest.note}</div><p>Extensão mostra tudo que você consegue alcançar hoje.</p><div className="actions"><button onClick={() => startMic()}><RefreshCw /> Refazer</button><button onClick={confirmRangeAndGoToTessitura}><Check /> Confirmar</button></div></section>}
    {step === 'tess-high' && highest && tessHigh != null && <Tessitura title="Tessitura vocal" text="Agora vamos encontrar seu agudo confortável. Repita a palavra na nota sugerida." midi={tessHigh} phrase="eu consigo" instruction="Cante na mesma nota e na mesma oitava da referência" downLabel="Quero descer a nota" tuner={highTuner} onPlay={playNote} onMove={() => { setTessHigh(Math.max(lowest?.midi ?? 24, tessHigh - 1)); setTessituraSteps((s) => [...s, { area: 'high', action: 'down', midi: tessHigh - 1 }]); }} onConfirm={() => setStep('tess-low')} onExit={resetAll} />}
    {step === 'tess-low' && lowest && tessLow != null && <Tessitura title="Tessitura vocal" text="Agora vamos encontrar seu grave confortável. Repita a palavra na nota sugerida." midi={tessLow} phrase="eu consigo" instruction="Cante na mesma nota e na mesma oitava da referência" downLabel="Quero subir a nota" icon="up" tuner={lowTuner} onPlay={playNote} onMove={() => { setTessLow(Math.min(highest?.midi ?? 96, tessLow + 1)); setTessituraSteps((s) => [...s, { area: 'low', action: 'up', midi: tessLow + 1 }]); }} onConfirm={() => setStep('gender')} onExit={resetAll} />}
    {step === 'gender' && <section className="vocal-stage hero"><h1>Selecione uma referência vocal</h1><p>Essa informação ajuda apenas a estimar melhor a tendência vocal.</p><div className="choice-grid">{[['masculino','Masculino'],['feminino','Feminino'],['nao_informar','Prefiro não informar']].map(([value,label]) => <button className={gender === value ? 'selected' : ''} key={value} onClick={() => setGender(value as Gender)}>{label}</button>)}</div><button onClick={() => setStep('result')}>Ver resultado</button></section>}
    {step === 'result' && lowest && highest && <section className="vocal-stage hero result"><h1>Seu Mapa Vocal</h1><div className="result-grid"><article><span>Extensão</span><strong>{lowest.note} → {highest.note}</strong></article><article><span>Tessitura confortável</span><strong>{tessLow != null ? midiToBrazilianNoteName(tessLow) : '—'} → {tessHigh != null ? midiToBrazilianNoteName(tessHigh) : '—'}</strong></article><article><span>Tendência vocal</span><strong>{result.classification}</strong></article><article><span>Confiança</span><strong>{Math.round(result.confidence * 100)}%</strong></article></div><p>Essa é uma leitura inicial. Sua voz pode evoluir conforme técnica, saúde vocal, aquecimento, consciência corporal e treino.</p>{validation && <strong className="error">{validation}</strong>}{saveMessage && <strong className="save-message">{saveMessage}</strong>}<div className="actions"><button disabled={saving || Boolean(validation)} onClick={save}><Save /> {saving ? 'Salvando...' : 'Salvar no meu perfil'}</button><button onClick={resetAll}><RefreshCw /> Refazer avaliação</button><Link href="/aluno/biblioteca">Ver aulas recomendadas</Link></div></section>}
  </div>;
}

function getTunerState(currentMidi: number | null, targetMidi?: number | null) {
  if (currentMidi == null || targetMidi == null) return { cents: null as number | null, x: 50, status: 'waiting', label: 'Cante para validar a nota' };
  const rawCents = (currentMidi - targetMidi) * 100;
  const x = Math.max(5, Math.min(95, 50 + Math.tanh(rawCents / 35) * 45));
  const abs = Math.abs(rawCents);
  if (abs <= 10) return { cents: rawCents, x: 50, status: 'in-tune', label: 'Afinado na nota e na oitava correta!' };
  if (rawCents <= -650) return { cents: rawCents, x: 5, status: 'low', label: 'Mesma nota, mas uma oitava abaixo. Suba a oitava.' };
  if (rawCents >= 650) return { cents: rawCents, x: 95, status: 'high', label: 'Mesma nota, mas uma oitava acima. Desça a oitava.' };
  if (rawCents < -55) return { cents: rawCents, x, status: 'low', label: 'Abaixo da nota sugerida' };
  if (rawCents < -10) return { cents: rawCents, x, status: 'almost-low', label: abs <= 25 ? 'Quase no centro' : 'Um pouco abaixo' };
  if (rawCents > 55) return { cents: rawCents, x, status: 'high', label: 'Acima da nota sugerida' };
  return { cents: rawCents, x, status: 'almost-high', label: abs <= 25 ? 'Quase no centro' : 'Um pouco acima' };
}

function mobileGlowFromMidi(midi?: number | null) { if (midi == null) return { region: 'chest', top: 54, left: 53, width: 29, height: 17 }; if (midi >= 72) return { region: 'head', top: 21, left: 55, width: 18, height: 12 }; if (midi >= 55) return { region: 'mix', top: 36, left: 54, width: 23, height: 15 }; return { region: 'chest', top: 54, left: 53, width: 29, height: 17 }; }

function MobileRangeCapture({ currentMidi, lowestMidi, highestMidi, liveNote, captureReady, captureReview, captureRange, onBack, onRetry, onPrimary }: any) {
  const minMidi = 24; const maxMidi = 96; const clamp = (midi: number) => Math.max(minMidi, Math.min(maxMidi, midi)); const percent = (midi: number) => 100 - ((clamp(midi) - minMidi) / (maxMidi - minMidi)) * 100; const labels = Array.from({ length: Math.floor((maxMidi - minMidi) / 4) + 1 }, (_, index) => maxMidi - index * 4); const glow = mobileGlowFromMidi(currentMidi);
  return <div className="mvr-shell"><div className="mvr-ruler"><div className="mvr-line" />{labels.map((midi) => <span key={midi} className={midi % 12 === 0 ? 'octave' : ''} style={{ top: `${percent(midi)}%` }}>{midiToBrazilianNoteName(midi)}</span>)}{highestMidi != null && <b className="mvr-limit mvr-limit-high" style={{ top: `${percent(highestMidi)}%` }}><em>{midiToBrazilianNoteName(highestMidi)}</em></b>}{lowestMidi != null && <b className="mvr-limit mvr-limit-low" style={{ top: `${percent(lowestMidi)}%` }}><em>{midiToBrazilianNoteName(lowestMidi)}</em></b>}{currentMidi != null && <i className="mvr-dot" style={{ top: `${percent(currentMidi)}%` }} />}</div><div className="mvr-visual"><div className="mvr-aura" /><img src="/vocal/vocal-body-base.png" alt="Silhueta vocal" draggable={false} /><b className={`mvr-glow ${glow.region}`} style={{ top: `${glow.top}%`, left: `${glow.left}%`, width: `${glow.width}%`, height: `${glow.height}%` }} /><span className="head">CABEÇA</span><span className="mix">VOZ MISTA</span><span className="chest">PEITO</span></div><header><small>ETAPA 1/3</small><h1>Mapeie sua extensão vocal</h1><p>Cante do grave ao agudo. A régua marca os extremos.</p></header><div className="mvr-note"><small>NOTA ATUAL</small><strong>{liveNote}</strong></div>{captureReview && <div className="mvr-result"><span>Extensão captada</span><strong>{captureRange}</strong></div>}<button className="mvr-back" onClick={onBack} aria-label="Sair">←</button><button className="mvr-main" disabled={!captureReady} onClick={onPrimary}>{captureReview ? 'Confirmar extensão' : 'Pressione quando terminar'}</button><button className="mvr-retry" onClick={onRetry} aria-label="Tentar de novo"><RefreshCw /></button></div>;
}

function Tessitura({ title, text, midi, phrase, instruction, downLabel, icon, tuner, onPlay, onMove, onConfirm, onExit }: any) {
  const note = midiToBrazilianNoteName(midi);
  return <section className="vocal-stage tessitura-stage"><button type="button" className="tessitura-exit" onClick={onExit} aria-label="Voltar">‹</button><div className="tessitura-figure" aria-hidden="true"><img src="/vocal/vocal-body-base.png" alt="" draggable={false} /><span /></div><div className="tessitura-copy"><p className="tessitura-step">ETAPA 2/3</p><h1>{title}</h1><p className="tessitura-lead">{text}</p><div className="tessitura-note-card"><div><span>NOTA SUGERIDA</span><strong>{note}</strong></div><button type="button" onClick={() => onPlay(midi)}><Play /><b>{note}</b><small>Tocar piano</small></button></div><div className="tessitura-sing-card"><i><Mic2 size={28} /></i><div><strong>{instruction || 'Cante a palavra na nota sugerida'}</strong><p>Diga “{phrase || 'eu consigo'}” com qualidade e conforto.</p></div></div><div className={`tessitura-tuner ${tuner?.status || 'waiting'}`} style={{ '--tuner-x': `${tuner?.x ?? 50}%` } as any}><span>MONITORAMENTO DE AFINAÇÃO</span><div className="tessitura-scale"><b /><i /></div><div className="tessitura-scale-labels"><small>Abaixo</small><small>Na nota</small><small>Acima</small></div><p><Check size={18} /> {tuner?.label || 'Cante para validar a nota'}</p></div><div className="actions tessitura-actions"><button onClick={onConfirm}><Check /> Consegui com conforto</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} Difícil / sem qualidade</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} {downLabel}</button></div><div className="tessitura-tip"><Sparkles size={20} /><p>Dica: mantenha o volume moderado e foque na qualidade do som.</p></div></div></section>;
}

const css = `
.vocal-test-shell{min-height:100dvh;padding:18px 14px 110px;color:#fff;background:#050507}.vocal-stage{max-width:1120px;margin:0 auto;border:1px solid rgba(255,255,255,.12);border-radius:30px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.45);padding:24px}.vocal-stage.hero{text-align:center;display:grid;gap:18px;place-items:center}.range-desktop-ui{display:grid;grid-template-columns:minmax(360px,1.12fr) minmax(0,.88fr);gap:22px;align-items:stretch}.range-copy{align-self:center}.vocal-stage h1{margin:0;font-size:clamp(34px,7vw,58px);letter-spacing:-.06em}.vocal-stage p{margin:0;color:rgba(255,255,255,.72);font-size:18px;line-height:1.45}.eyebrow{color:#67e8f9!important;font-size:12px!important;text-transform:uppercase;letter-spacing:.18em;font-weight:1000}.tip,.vocal-stage small{color:#f5c76b!important}.vocal-stage button,.vocal-stage a{border:0;border-radius:18px;padding:15px 18px;background:linear-gradient(180deg,#ffe29a,#e8ad34);color:#120d05;font-weight:950;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px}.actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.actions button:nth-child(n+2){background:rgba(255,255,255,.09);color:#fff;border:1px solid rgba(255,255,255,.12)}.range-big{font-size:54px;font-weight:1000;letter-spacing:-.05em;color:#67e8f9}.choice-grid,.result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:760px}.result-grid{grid-template-columns:repeat(2,1fr)}.result-grid article{border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:18px;background:rgba(0,0,0,.25)}.result-grid span{display:block;color:rgba(255,255,255,.62);margin-bottom:7px}.result-grid strong{font-size:24px}.mvr-shell{display:none}body.vocal-capture-active{overflow:hidden!important}body.vocal-capture-active nav,body.vocal-capture-active footer,body.vocal-capture-active [class*="bottom"],body.vocal-capture-active [class*="Bottom"],body.vocal-capture-active [class*="tab-bar"],body.vocal-capture-active [class*="TabBar"],body.vocal-capture-active [class*="mobile-nav"],body.vocal-capture-active [class*="MobileNav"]{display:none!important}@media(max-width:760px){.vocal-test-shell{padding:0;background:#020304;min-height:100dvh;overflow:hidden}.range-capture{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#020304!important;box-shadow:none!important;overflow:hidden!important;z-index:2147483647!important}.range-desktop-ui{display:none!important}.mvr-shell{display:block;position:absolute;inset:0;background:#020304;color:#fff;overflow:hidden}.choice-grid,.result-grid{grid-template-columns:1fr}}
`;
