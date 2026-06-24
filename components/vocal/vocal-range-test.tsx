'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Mic2, Play, RefreshCw, Save, Sparkles } from 'lucide-react';
import { autoCorrelate, classifyVoice, frequencyToMidi, midiToFrequency, midiToBrazilianNoteName, formatBrazilianNote } from '@/lib/audio/pitch';
import { VocalNoteMeter } from './vocal-note-meter';

type Captured = { note: string; midi: number; frequency: number };
type Gender = 'masculino' | 'feminino' | 'nao_informar';
type Step = 'intro' | 'lowest' | 'highest' | 'confirm-range' | 'tess-high' | 'tess-low' | 'gender' | 'result';
type Props = { profileId: string; authUserId?: string | null; initialProfile?: any };

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
  const audioRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; stream: MediaStream; raf: number } | null>(null);
  const stableRef = useRef<{ midi: number | null; since: number }>({ midi: null, since: 0 });
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

  async function startMic({ reset = true }: { reset?: boolean } = {}) {
    setMicError('');
    if (audioRef.current) stopMic();
    if (reset) {
      setLowest(null);
      setHighest(null);
      setCurrentFrequency(null);
      setCurrentMidi(null);
      setStableMidi(null);
    }
    setCaptureReview(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        const freq = autoCorrelate(data, ctx.sampleRate);
        if (freq) {
          const midi = frequencyToMidi(freq);
          setCurrentFrequency(freq);
          setCurrentMidi(midi);
          const now = performance.now();
          if (stableRef.current.midi === midi) {
            if (now - stableRef.current.since > 220) {
              setStableMidi(midi);
              const item = { midi, note: midiToBrazilianNoteName(midi), frequency: freq };
              if (stepRef.current === 'lowest') {
                setLowest((old) => !old || item.midi < old.midi ? item : old);
                setHighest((old) => !old || item.midi > old.midi ? item : old);
              }
            }
          } else stableRef.current = { midi, since: now };
        }
        audioRef.current!.raf = requestAnimationFrame(tick);
      };
      audioRef.current = { ctx, analyser, stream, raf: requestAnimationFrame(tick) };
      setStep('lowest');
    } catch {
      setMicError('Não conseguimos acessar seu microfone. Verifique as permissões do navegador.');
    }
  }

  useEffect(() => { stepRef.current = step; if (step !== 'lowest') setCaptureReview(false); }, [step]);
  useEffect(() => { document.body.classList.toggle('vocal-capture-active', step === 'lowest'); return () => document.body.classList.remove('vocal-capture-active'); }, [step]);
  useEffect(() => () => stopMic(), []);
  function stopMic() { const a = audioRef.current; if (!a) return; cancelAnimationFrame(a.raf); a.stream.getTracks().forEach((t) => t.stop()); a.ctx.close(); audioRef.current = null; }
  function playNote(midi: number) { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'triangle'; osc.frequency.value = midiToFrequency(midi); gain.gain.setValueAtTime(0.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.04); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1); }
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

  return <div className="vocal-test-shell">
    <style>{css}</style>
    {step === 'intro' && <section className="vocal-stage hero"><Sparkles size={34} /><h1>Vamos criar seu Mapa Vocal</h1><p>Esse teste identifica sua extensão, sua tessitura confortável e uma tendência vocal aproximada.</p><p className="tip">Não force. Técnica vocal é consciência, não violência.</p>{micError && <strong className="error">{micError}</strong>}<button onClick={() => startMic()} aria-label="Iniciar avaliação vocal"><Mic2 /> Iniciar avaliação</button></section>}
    {step === 'lowest' && <section className="vocal-stage grid range-capture">
      <div className="range-desktop-ui"><VocalNoteMeter currentMidi={currentMidi} lowestMidi={lowest?.midi} highestMidi={highest?.midi} /><div className="range-copy"><p className="eyebrow">ETAPA 1/3</p><h1>Mapeie sua extensão vocal</h1><p className="range-helper">Cante do grave ao agudo. A régua marca os extremos.</p>{captureReview && <div className="capture-result"><span>Extensão captada</span><strong>{captureRange}</strong><small>Confirme para seguir ou tente novamente.</small></div>}<div className="actions"><button disabled={!captureReady} onClick={(event) => { event.stopPropagation(); captureReview ? confirmRangeAndGoToTessitura() : finishMapping(); }}>{captureReview ? 'Confirmar extensão' : 'Pressione quando terminar'}</button><button onClick={(event) => { event.stopPropagation(); retryMapping(); }}><RefreshCw /> Tentar de novo</button></div></div></div>
      <MobileRangeCapture currentMidi={currentMidi} liveNote={liveNote} captureReady={captureReady} captureReview={captureReview} captureRange={captureRange} onBack={resetAll} onRetry={retryMapping} onPrimary={() => captureReview ? confirmRangeAndGoToTessitura() : finishMapping()} />
    </section>}
    {step === 'confirm-range' && lowest && highest && <section className="vocal-stage hero"><h1>Confirmar alcance vocal?</h1><div className="range-big">{lowest.note} ↔ {highest.note}</div><p>Extensão mostra tudo que você consegue alcançar hoje.</p><div className="actions"><button onClick={() => startMic()}><RefreshCw /> Refazer</button><button onClick={confirmRangeAndGoToTessitura}><Check /> Confirmar</button></div></section>}
    {step === 'tess-high' && highest && tessHigh != null && <Tessitura title="Agora vamos encontrar seu agudo confortável" text="O sistema vai partir da sua nota mais alta. Cante uma frase curta nessa nota e diga se ela saiu com conforto e qualidade." midi={tessHigh} lowestMidi={lowest?.midi} highestMidi={highest?.midi} phrase="Eu consigo cantar com qualidade" downLabel="Descer meio tom" onPlay={playNote} onMove={() => { setTessHigh(Math.max(lowest?.midi ?? 24, tessHigh - 1)); setTessituraSteps((s) => [...s, { area: 'high', action: 'down', midi: tessHigh - 1 }]); }} onConfirm={() => setStep('tess-low')} />}
    {step === 'tess-low' && lowest && tessLow != null && <Tessitura title="Agora vamos encontrar seu grave confortável" text="Cante a frase com presença e clareza. Se estiver soproso, fraco ou desconfortável, suba meio tom." midi={tessLow} lowestMidi={lowest?.midi} highestMidi={highest?.midi} phrase="Eu consigo cantar com qualidade" downLabel="Subir meio tom" icon="up" onPlay={playNote} onMove={() => { setTessLow(Math.min(highest?.midi ?? 96, tessLow + 1)); setTessituraSteps((s) => [...s, { area: 'low', action: 'up', midi: tessLow + 1 }]); }} onConfirm={() => setStep('gender')} />}
    {step === 'gender' && <section className="vocal-stage hero"><h1>Selecione uma referência vocal</h1><p>Essa informação ajuda apenas a estimar melhor a tendência vocal.</p><div className="choice-grid">{[['masculino','Masculino'],['feminino','Feminino'],['nao_informar','Prefiro não informar']].map(([value,label]) => <button className={gender === value ? 'selected' : ''} key={value} onClick={() => setGender(value as Gender)}>{label}</button>)}</div><button onClick={() => setStep('result')}>Ver resultado</button></section>}
    {step === 'result' && lowest && highest && <section className="vocal-stage hero result"><h1>Seu Mapa Vocal</h1><div className="result-grid"><article><span>Extensão</span><strong>{lowest.note} → {highest.note}</strong></article><article><span>Tessitura confortável</span><strong>{tessLow != null ? midiToBrazilianNoteName(tessLow) : '—'} → {tessHigh != null ? midiToBrazilianNoteName(tessHigh) : '—'}</strong></article><article><span>Tendência vocal</span><strong>{result.classification}</strong></article><article><span>Confiança</span><strong>{Math.round(result.confidence * 100)}%</strong></article></div><p>Essa é uma leitura inicial. Sua voz pode evoluir conforme técnica, saúde vocal, aquecimento, consciência corporal e treino.</p>{validation && <strong className="error">{validation}</strong>}{saveMessage && <strong className="save-message">{saveMessage}</strong>}<div className="actions"><button disabled={saving || Boolean(validation)} onClick={save}><Save /> {saving ? 'Salvando...' : 'Salvar no meu perfil'}</button><button onClick={resetAll}><RefreshCw /> Refazer avaliação</button><Link href="/aluno/biblioteca">Ver aulas recomendadas</Link></div></section>}
  </div>;
}

function mobileGlowFromMidi(midi?: number | null) {
  if (midi == null) return { region: 'chest', top: 54, left: 53, width: 29, height: 17 };
  if (midi >= 72) return { region: 'head', top: 21, left: 55, width: 18, height: 12 };
  if (midi >= 55) return { region: 'mix', top: 36, left: 54, width: 23, height: 15 };
  return { region: 'chest', top: 54, left: 53, width: 29, height: 17 };
}

function MobileRangeCapture({ currentMidi, liveNote, captureReady, captureReview, captureRange, onBack, onRetry, onPrimary }: any) {
  const minMidi = 24;
  const maxMidi = 96;
  const clamp = (midi: number) => Math.max(minMidi, Math.min(maxMidi, midi));
  const percent = (midi: number) => 100 - ((clamp(midi) - minMidi) / (maxMidi - minMidi)) * 100;
  const labels = Array.from({ length: Math.floor((maxMidi - minMidi) / 4) + 1 }, (_, index) => maxMidi - index * 4);
  const glow = mobileGlowFromMidi(currentMidi);
  return <div className="mvr-shell">
    <div className="mvr-ruler">
      <div className="mvr-line" />
      {labels.map((midi) => <span key={midi} className={midi % 12 === 0 ? 'octave' : ''} style={{ top: `${percent(midi)}%` }}>{midiToBrazilianNoteName(midi)}</span>)}
      {currentMidi != null && <i className="mvr-dot" style={{ top: `${percent(currentMidi)}%` }} />}
    </div>
    <div className="mvr-visual"><div className="mvr-aura" /><img src="/vocal/vocal-body-base.png" alt="Silhueta vocal" draggable={false} /><b className={`mvr-glow ${glow.region}`} style={{ top: `${glow.top}%`, left: `${glow.left}%`, width: `${glow.width}%`, height: `${glow.height}%` }} /><span className="head">CABEÇA</span><span className="mix">VOZ MISTA</span><span className="chest">PEITO</span></div>
    <header><small>ETAPA 1/3</small><h1>Mapeie sua extensão vocal</h1><p>Cante do grave ao agudo. A régua marca os extremos.</p></header>
    <div className="mvr-note"><small>NOTA ATUAL</small><strong>{liveNote}</strong></div>
    {captureReview && <div className="mvr-result"><span>Extensão captada</span><strong>{captureRange}</strong></div>}
    <button className="mvr-back" onClick={onBack} aria-label="Sair">←</button>
    <button className="mvr-main" disabled={!captureReady} onClick={onPrimary}>{captureReview ? 'Confirmar extensão' : 'Pressione quando terminar'}</button>
    <button className="mvr-retry" onClick={onRetry} aria-label="Tentar de novo"><RefreshCw /></button>
  </div>;
}

function Tessitura({ title, text, midi, lowestMidi, highestMidi, phrase, downLabel, icon, onPlay, onMove, onConfirm }: any) { return <section className="vocal-stage tessitura-grid"><div className="tessitura-copy"><h1>{title}</h1><p>{text}</p><small>Use volume moderado.</small><div className="range-big">{midiToBrazilianNoteName(midi)}</div><blockquote>“{phrase}”</blockquote><div className="actions"><button onClick={() => onPlay(midi)}><Play /> Tocar nota</button><button onClick={onConfirm}><Check /> Consegui com conforto</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} Difícil / sem qualidade</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} {downLabel}</button></div></div><VocalNoteMeter currentMidi={midi} lowestMidi={lowestMidi} highestMidi={highestMidi} /></section>; }

const css = `
.vocal-test-shell{min-height:100dvh;padding:18px 14px 110px;color:#fff;background:radial-gradient(circle at 70% 5%,rgba(42,204,221,.2),transparent 28%),radial-gradient(circle at 10% 15%,rgba(245,199,107,.18),transparent 32%),#050507}
.vocal-stage{max-width:1120px;margin:0 auto;border:1px solid rgba(255,255,255,.12);border-radius:30px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.45);padding:24px}.vocal-stage.hero{text-align:center;display:grid;gap:18px;place-items:center}.range-desktop-ui{display:grid;grid-template-columns:minmax(360px,1.12fr) minmax(0,.88fr);gap:22px;align-items:stretch}.vocal-stage.tessitura-grid{display:grid;grid-template-columns:minmax(360px,1.12fr) minmax(0,.88fr);gap:22px;align-items:stretch}.range-copy{align-self:center}.capture-result{margin:20px 0;padding:18px;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(0,0,0,.25);display:grid;gap:4px}.capture-result span{color:rgba(255,255,255,.58);font-size:12px;text-transform:uppercase;letter-spacing:.14em}.capture-result strong{font-size:34px;color:#67e8f9}.capture-result small{color:#f5c76b!important}.tessitura-copy{text-align:center;display:grid;gap:14px;place-items:center;align-content:center}.vocal-stage h1{margin:0;font-size:clamp(34px,7vw,58px);letter-spacing:-.06em}.vocal-stage p{margin:0;color:rgba(255,255,255,.72);font-size:18px;line-height:1.45}.eyebrow{color:#67e8f9!important;font-size:12px!important;text-transform:uppercase;letter-spacing:.18em;font-weight:1000}.tip,.vocal-stage small{color:#f5c76b!important}.vocal-stage button,.vocal-stage a{border:0;border-radius:18px;padding:15px 18px;background:linear-gradient(180deg,#ffe29a,#e8ad34);color:#120d05;font-weight:950;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px}.vocal-stage button:disabled{opacity:.45}.actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.actions button:nth-child(n+2){background:rgba(255,255,255,.09);color:#fff;border:1px solid rgba(255,255,255,.12)}.range-big{font-size:54px;font-weight:1000;letter-spacing:-.05em;color:#67e8f9}.error{color:#ff8a8a}.save-message{color:#86efac}.choice-grid,.result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:760px}.choice-grid button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)}.choice-grid .selected{border-color:#67e8f9;box-shadow:0 0 0 3px rgba(103,232,249,.12)}.result-grid{grid-template-columns:repeat(2,1fr)}.result-grid article{border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:18px;background:rgba(0,0,0,.25)}.result-grid span{display:block;color:rgba(255,255,255,.62);margin-bottom:7px}.result-grid strong{font-size:24px}blockquote{font-size:22px;color:#fff}.mvr-shell{display:none}body.vocal-capture-active{overflow:hidden!important}body.vocal-capture-active nav,body.vocal-capture-active footer,body.vocal-capture-active [class*="bottom"],body.vocal-capture-active [class*="Bottom"],body.vocal-capture-active [class*="tab-bar"],body.vocal-capture-active [class*="TabBar"],body.vocal-capture-active [class*="mobile-nav"],body.vocal-capture-active [class*="MobileNav"]{display:none!important}
@media(max-width:760px){.vocal-test-shell{padding:0;background:#020304;min-height:100dvh;overflow:hidden}.range-capture{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#020304!important;box-shadow:none!important;overflow:hidden!important;z-index:2147483647!important}.range-desktop-ui{display:none!important}.mvr-shell{display:block;position:absolute;inset:0;background:radial-gradient(circle at 62% 48%,rgba(55,210,224,.16),transparent 30%),radial-gradient(circle at 62% 61%,rgba(245,199,107,.14),transparent 28%),#020304;color:#fff;overflow:hidden}.mvr-ruler{position:absolute;left:28px;top:calc(142px + env(safe-area-inset-top));width:112px;height:calc(100dvh - 282px);z-index:20}.mvr-line{position:absolute;left:72px;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#67e8f9 0%,#67e8f9 53%,#f5c76b 53%,#f5c76b 100%);box-shadow:0 0 18px rgba(103,232,249,.5)}.mvr-ruler:after{content:'';position:absolute;left:72px;top:0;bottom:0;width:32px;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.25) 0 1px,transparent 1px 26px)}.mvr-ruler span{position:absolute;left:0;transform:translateY(-50%);font-size:12px;line-height:1;font-weight:850;color:rgba(255,255,255,.56);white-space:nowrap}.mvr-ruler span.octave{font-size:20px;font-weight:1000;color:rgba(255,255,255,.96)}.mvr-dot{position:absolute;left:48px;width:50px;height:50px;border-radius:999px;background:#67e8f9;transform:translateY(-50%);box-shadow:0 0 28px rgba(103,232,249,.9),0 0 70px rgba(103,232,249,.5);z-index:10}.mvr-visual{position:absolute;left:102px;right:-72px;top:calc(154px + env(safe-area-inset-top));height:calc(100dvh - 350px);z-index:4}.mvr-visual:before{content:'';position:absolute;inset:0;background:transparent}.mvr-aura{position:absolute;inset:5% 4% 10% 0;border-radius:999px;background:radial-gradient(ellipse at center,rgba(103,232,249,.16),rgba(103,232,249,.04) 45%,transparent 72%);filter:blur(22px)}.mvr-visual img{position:absolute;right:-18vw;top:0;width:124vw;height:100%;object-fit:contain;object-position:center top;opacity:.78;mix-blend-mode:screen;filter:drop-shadow(0 0 24px rgba(236,254,255,.16))}.mvr-glow{position:absolute;border-radius:999px;transform:translate(-50%,-50%);transition:top .18s ease,left .18s ease,width .18s ease,height .18s ease,background .18s ease,filter .18s ease;mix-blend-mode:screen}.mvr-glow.chest{background:radial-gradient(ellipse at center,rgba(255,235,170,.95),rgba(245,199,107,.48) 38%,transparent 72%);filter:blur(10px) drop-shadow(0 0 30px rgba(245,199,107,.85))}.mvr-glow.mix{background:radial-gradient(ellipse at center,rgba(255,255,255,.92),rgba(103,232,249,.46) 38%,transparent 72%);filter:blur(9px) drop-shadow(0 0 28px rgba(103,232,249,.82))}.mvr-glow.head{background:radial-gradient(ellipse at center,rgba(255,255,255,.92),rgba(167,139,250,.48) 38%,transparent 72%);filter:blur(8px) drop-shadow(0 0 28px rgba(167,139,250,.84))}.mvr-visual span{position:absolute;right:7vw;font-size:14px;font-weight:950;letter-spacing:.05em;color:rgba(255,255,255,.62);text-transform:uppercase}.mvr-visual .head{top:18%}.mvr-visual .mix{top:35%}.mvr-visual .chest{top:50%;color:#f5c76b;text-shadow:0 0 18px rgba(245,199,107,.8)}.mvr-shell header{position:absolute;top:calc(50px + env(safe-area-inset-top));left:0;right:0;padding:0 24px;text-align:center;z-index:30}.mvr-shell header small{display:block;margin-bottom:11px;color:rgba(255,255,255,.5)!important;font-size:12px;font-weight:1000;letter-spacing:.16em}.mvr-shell header h1{margin:0 auto;color:#fff;font-size:clamp(27px,7.2vw,34px);line-height:1.04;letter-spacing:-.045em;font-weight:1000;text-shadow:0 0 16px rgba(0,0,0,.9);max-width:560px}.mvr-shell header p{margin:12px auto 0;color:rgba(255,255,255,.62);font-size:16px;line-height:1.22;max-width:560px;text-shadow:0 0 12px rgba(0,0,0,.9)}.mvr-note{position:absolute;left:50%;bottom:calc(142px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:35;padding:10px 24px 12px;border:1px solid rgba(255,255,255,.15);border-radius:22px;background:rgba(0,0,0,.54);text-align:center;backdrop-filter:blur(14px)}.mvr-note small{display:block;color:rgba(255,255,255,.58)!important;font-size:12px!important;font-weight:900;letter-spacing:.13em}.mvr-note strong{display:block;color:#67e8f9;font-size:38px;line-height:.95;letter-spacing:-.05em}.mvr-result{position:absolute;left:144px;right:18px;bottom:calc(222px + env(safe-area-inset-bottom));z-index:40;padding:10px 14px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.55);text-align:center}.mvr-result span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:rgba(255,255,255,.55)}.mvr-result strong{display:block;color:#67e8f9;font-size:24px}.mvr-back,.mvr-retry{position:absolute;bottom:calc(48px + env(safe-area-inset-bottom));z-index:60;width:66px!important;height:66px!important;min-height:66px!important;border-radius:999px!important;background:rgba(255,255,255,.055)!important;border:1px solid rgba(255,255,255,.16)!important;color:#fff!important;padding:0!important;font-size:32px!important;backdrop-filter:blur(14px)}.mvr-back{left:34px}.mvr-retry{right:34px}.mvr-retry svg{width:30px;height:30px}.mvr-main{position:absolute;left:50%;bottom:calc(54px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:65;width:min(52vw,420px)!important;min-width:260px!important;height:58px!important;min-height:58px!important;border-radius:999px!important;background:linear-gradient(180deg,#ffe29a,#e8ad34)!important;color:#120d05!important;font-size:15px!important;font-weight:1000!important;white-space:nowrap!important;padding:0 22px!important}.vocal-stage:not(.range-capture),.vocal-stage.tessitura-grid{margin:18px 14px;border-radius:24px;padding:18px}.vocal-stage.tessitura-grid{grid-template-columns:1fr}.tessitura-copy{order:2}.tessitura-grid>.vocal-meter{order:1}.choice-grid,.result-grid{grid-template-columns:1fr}}
`;
