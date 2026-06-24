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
  useEffect(() => () => stopMic(), []);
  function stopMic() { const a = audioRef.current; if (!a) return; cancelAnimationFrame(a.raf); a.stream.getTracks().forEach((t) => t.stop()); a.ctx.close(); audioRef.current = null; }
  function playNote(midi: number) { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'triangle'; osc.frequency.value = midiToFrequency(midi); gain.gain.setValueAtTime(0.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.04); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1); }
  function resetAll() { setLowest(null); setHighest(null); setTessHigh(null); setTessLow(null); setSaveMessage(''); setTessituraSteps([]); setCaptureReview(false); setStep('intro'); stopMic(); }
  function finishMapping() { if (!lowest || !highest) return; stopMic(); setCaptureReview(true); }
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

  return <div className="vocal-test-shell">
    <style>{css}</style>
    {step === 'intro' && <section className="vocal-stage hero"><Sparkles size={34} /><h1>Vamos criar seu Mapa Vocal</h1><p>Esse teste identifica sua extensão, sua tessitura confortável e uma tendência vocal aproximada.</p><p className="tip">Não force. Técnica vocal é consciência, não violência.</p>{micError && <strong className="error">{micError}</strong>}<button onClick={() => startMic()} aria-label="Iniciar avaliação vocal"><Mic2 /> Iniciar avaliação</button></section>}
    {step === 'lowest' && <section className="vocal-stage grid range-capture"><VocalNoteMeter currentMidi={currentMidi} lowestMidi={lowest?.midi} highestMidi={highest?.midi} /><button className="capture-back" onClick={resetAll} aria-label="Sair da avaliação">←</button><div className="range-copy"><p className="eyebrow">Etapa 1/3</p><h1>Mapeie sua extensão vocal</h1><p className="range-helper">Cante livremente do grave ao agudo. A régua marca seus extremos.</p>{captureReview && <div className="capture-result"><span>Extensão captada</span><strong>{captureRange}</strong><small>Confirme para seguir ou tente novamente.</small></div>}<div className="actions"><button disabled={!captureReady} onClick={captureReview ? confirmRangeAndGoToTessitura : finishMapping}>{captureReview ? 'Confirmar extensão' : 'Pressione quando terminar'}</button><button onClick={retryMapping}><RefreshCw /> Tentar de novo</button></div></div></section>}
    {step === 'confirm-range' && lowest && highest && <section className="vocal-stage hero"><h1>Confirmar alcance vocal?</h1><div className="range-big">{lowest.note} ↔ {highest.note}</div><p>Extensão mostra tudo que você consegue alcançar hoje.</p><div className="actions"><button onClick={() => startMic()}><RefreshCw /> Refazer</button><button onClick={confirmRangeAndGoToTessitura}><Check /> Confirmar</button></div></section>}
    {step === 'tess-high' && highest && tessHigh != null && <Tessitura title="Agora vamos encontrar seu agudo confortável" text="O sistema vai partir da sua nota mais alta. Cante uma frase curta nessa nota e diga se ela saiu com conforto e qualidade." midi={tessHigh} lowestMidi={lowest?.midi} highestMidi={highest?.midi} phrase="Eu consigo cantar com qualidade" downLabel="Descer meio tom" onPlay={playNote} onMove={() => { setTessHigh(Math.max(lowest?.midi ?? 24, tessHigh - 1)); setTessituraSteps((s) => [...s, { area: 'high', action: 'down', midi: tessHigh - 1 }]); }} onConfirm={() => setStep('tess-low')} />}
    {step === 'tess-low' && lowest && tessLow != null && <Tessitura title="Agora vamos encontrar seu grave confortável" text="Cante a frase com presença e clareza. Se estiver soproso, fraco ou desconfortável, suba meio tom." midi={tessLow} lowestMidi={lowest?.midi} highestMidi={highest?.midi} phrase="Eu consigo cantar com qualidade" downLabel="Subir meio tom" icon="up" onPlay={playNote} onMove={() => { setTessLow(Math.min(highest?.midi ?? 96, tessLow + 1)); setTessituraSteps((s) => [...s, { area: 'low', action: 'up', midi: tessLow + 1 }]); }} onConfirm={() => setStep('gender')} />}
    {step === 'gender' && <section className="vocal-stage hero"><h1>Selecione uma referência vocal</h1><p>Essa informação ajuda apenas a estimar melhor a tendência vocal.</p><div className="choice-grid">{[['masculino','Masculino'],['feminino','Feminino'],['nao_informar','Prefiro não informar']].map(([value,label]) => <button className={gender === value ? 'selected' : ''} key={value} onClick={() => setGender(value as Gender)}>{label}</button>)}</div><button onClick={() => setStep('result')}>Ver resultado</button></section>}
    {step === 'result' && lowest && highest && <section className="vocal-stage hero result"><h1>Seu Mapa Vocal</h1><div className="result-grid"><article><span>Extensão</span><strong>{lowest.note} → {highest.note}</strong></article><article><span>Tessitura confortável</span><strong>{tessLow != null ? midiToBrazilianNoteName(tessLow) : '—'} → {tessHigh != null ? midiToBrazilianNoteName(tessHigh) : '—'}</strong></article><article><span>Tendência vocal</span><strong>{result.classification}</strong></article><article><span>Confiança</span><strong>{Math.round(result.confidence * 100)}%</strong></article></div><p>Essa é uma leitura inicial. Sua voz pode evoluir conforme técnica, saúde vocal, aquecimento, consciência corporal e treino.</p>{validation && <strong className="error">{validation}</strong>}{saveMessage && <strong className="save-message">{saveMessage}</strong>}<div className="actions"><button disabled={saving || Boolean(validation)} onClick={save}><Save /> {saving ? 'Salvando...' : 'Salvar no meu perfil'}</button><button onClick={resetAll}><RefreshCw /> Refazer avaliação</button><Link href="/aluno/biblioteca">Ver aulas recomendadas</Link></div></section>}
  </div>;
}

function Tessitura({ title, text, midi, lowestMidi, highestMidi, phrase, downLabel, icon, onPlay, onMove, onConfirm }: any) { return <section className="vocal-stage tessitura-grid"><div className="tessitura-copy"><h1>{title}</h1><p>{text}</p><small>Use volume moderado.</small><div className="range-big">{midiToBrazilianNoteName(midi)}</div><blockquote>“{phrase}”</blockquote><div className="actions"><button onClick={() => onPlay(midi)}><Play /> Tocar nota</button><button onClick={onConfirm}><Check /> Consegui com conforto</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} Difícil / sem qualidade</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} {downLabel}</button></div></div><VocalNoteMeter currentMidi={midi} lowestMidi={lowestMidi} highestMidi={highestMidi} /></section>; }

const css = `.vocal-test-shell{min-height:100dvh;padding:18px 14px 110px;color:#fff;background:radial-gradient(circle at 70% 5%,rgba(42,204,221,.2),transparent 28%),radial-gradient(circle at 10% 15%,rgba(245,199,107,.18),transparent 32%),#050507}.vocal-stage{max-width:1120px;margin:0 auto;border:1px solid rgba(255,255,255,.12);border-radius:30px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.45);padding:24px}.vocal-stage.hero{text-align:center;display:grid;gap:18px;place-items:center}.vocal-stage.grid,.vocal-stage.tessitura-grid{display:grid;grid-template-columns:minmax(360px,1.12fr) minmax(0,.88fr);gap:22px;align-items:stretch}.range-copy{align-self:center}.range-helper{display:none}.capture-back{display:none}.capture-result{display:none}.tessitura-copy{text-align:center;display:grid;gap:14px;place-items:center;align-content:center}.vocal-stage h1{margin:0;font-size:clamp(34px,7vw,58px);letter-spacing:-.06em}.vocal-stage p{margin:0;color:rgba(255,255,255,.72);font-size:18px;line-height:1.45}.eyebrow{color:#67e8f9!important;font-size:13px!important;text-transform:uppercase;letter-spacing:.18em;font-weight:1000}.tip,.vocal-stage small{color:#f5c76b!important}.vocal-stage button,.vocal-stage a{border:0;border-radius:18px;padding:15px 18px;background:linear-gradient(180deg,#ffe29a,#e8ad34);color:#120d05;font-weight:950;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px}.vocal-stage button:disabled{opacity:.45}.actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.actions button:nth-child(n+2){background:rgba(255,255,255,.09);color:#fff;border:1px solid rgba(255,255,255,.12)}.readout{margin:22px 0;padding:20px;border-radius:24px;background:rgba(0,0,0,.28);display:grid;gap:6px}.readout strong,.range-big{font-size:54px;font-weight:1000;letter-spacing:-.05em;color:#67e8f9}.readout span{color:#f5c76b;font-weight:800}.error{color:#ff8a8a}.save-message{color:#86efac}.choice-grid,.result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:760px}.choice-grid button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)}.choice-grid .selected{border-color:#67e8f9;box-shadow:0 0 0 3px rgba(103,232,249,.12)}.result-grid{grid-template-columns:repeat(2,1fr)}.result-grid article{border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:18px;background:rgba(0,0,0,.25)}.result-grid span{display:block;color:rgba(255,255,255,.62);margin-bottom:7px}.result-grid strong{font-size:24px}blockquote{font-size:22px;color:#fff}@media(max-width:760px){.vocal-test-shell{padding:0;background:#050507;min-height:100dvh;overflow:hidden}.vocal-stage.grid.range-capture{position:fixed;inset:0;z-index:2147483647;min-height:100dvh;width:100%;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none;background:radial-gradient(circle at 70% 34%,rgba(42,204,221,.14),transparent 28%),radial-gradient(circle at 70% 62%,rgba(245,199,107,.11),transparent 30%),linear-gradient(180deg,#07080a,#050507);padding:0;display:block;overflow:hidden}.range-capture .vocal-meter{position:absolute;inset:0!important;width:100%;height:100dvh!important;min-height:100dvh!important;margin:0;border-radius:0!important}.capture-back{display:grid;place-items:center;position:absolute;left:24px;bottom:22px;z-index:40;width:48px;height:48px;min-height:48px;border-radius:999px!important;background:rgba(255,255,255,.08)!important;color:#fff!important;border:1px solid rgba(255,255,255,.14)!important;padding:0!important;font-size:25px!important;backdrop-filter:blur(12px)}.range-copy{position:absolute;inset:0;z-index:20;pointer-events:none;display:block;text-align:center}.range-copy .eyebrow{position:absolute;top:34px;left:110px;right:18px;font-size:12px!important;color:rgba(255,255,255,.52)!important;letter-spacing:.12em;text-transform:uppercase;font-weight:900;text-align:left}.range-copy h1{position:absolute;left:110px;right:18px;top:58px;font-size:clamp(22px,5.8vw,30px);line-height:1.05;letter-spacing:-.035em;color:rgba(255,255,255,.9);font-weight:950;text-align:left;text-shadow:0 0 14px rgba(0,0,0,.8)}.range-copy>p:not(.eyebrow):not(.range-helper){display:none}.range-helper{display:block;position:absolute;left:110px;right:18px;bottom:152px;color:rgba(255,255,255,.72)!important;font-size:14px!important;line-height:1.25;text-align:left;text-shadow:0 0 18px rgba(0,0,0,.8)}.readout{display:none}.capture-result{display:grid;position:absolute;left:96px;right:18px;bottom:128px;gap:3px;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(0,0,0,.52);padding:14px 16px;backdrop-filter:blur(14px);box-shadow:0 18px 50px rgba(0,0,0,.38)}.capture-result span{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.55)}.capture-result strong{font-size:30px;line-height:1;color:#67e8f9}.capture-result small{font-size:12px!important;color:rgba(255,255,255,.62)!important}.range-copy .actions{position:absolute;left:96px;right:18px;bottom:22px;display:grid;grid-template-columns:1fr;gap:9px;pointer-events:auto}.range-copy .actions button:first-child{width:100%;min-height:60px;border-radius:999px;background:linear-gradient(180deg,#ffe29a,#e8ad34)!important;color:#120d05!important;font-size:17px;line-height:1.05;text-align:center;font-weight:1000;padding:0 18px}.range-copy .actions button:first-child svg{display:none}.range-copy .actions button:nth-child(2){min-height:42px;border-radius:999px;background:rgba(255,255,255,.08)!important;color:#fff!important;border:1px solid rgba(255,255,255,.12)!important;font-size:14px}.vocal-stage:not(.range-capture),.vocal-stage.tessitura-grid{margin:18px 14px;border-radius:24px;padding:18px}.vocal-stage.tessitura-grid{grid-template-columns:1fr}.tessitura-copy{order:2}.tessitura-grid>.vocal-meter{order:1}.choice-grid,.result-grid{grid-template-columns:1fr}}`;
