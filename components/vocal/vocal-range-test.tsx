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

  const result = useMemo(() => classifyVoice({ tessituraLowMidi: tessLow, tessituraHighMidi: tessHigh, lowestMidi: lowest?.midi, highestMidi: highest?.midi, gender }), [tessLow, tessHigh, lowest, highest, gender]);
  const validation = useMemo(() => {
    if (!lowest || !highest || tessLow == null || tessHigh == null) return 'Complete todas as etapas para gerar seu mapa vocal.';
    if (lowest.midi > highest.midi) return 'A nota grave ficou acima da nota aguda. Refaça a avaliação.';
    if (tessLow < lowest.midi) return 'A tessitura grave ficou fora da extensão capturada. Refaça essa etapa.';
    if (tessHigh > highest.midi) return 'A tessitura aguda ficou fora da extensão capturada. Refaça essa etapa.';
    if (tessLow > tessHigh) return 'A tessitura grave ficou acima da aguda. Refaça a avaliação.';
    return '';
  }, [lowest, highest, tessLow, tessHigh]);

  async function startMic() {
    setMicError('');
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
          setCurrentFrequency(freq); setCurrentMidi(midi);
          const now = performance.now();
          if (stableRef.current.midi === midi) {
            if (now - stableRef.current.since > 380) setStableMidi(midi);
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

  useEffect(() => () => stopMic(), []);
  function stopMic() { const a = audioRef.current; if (!a) return; cancelAnimationFrame(a.raf); a.stream.getTracks().forEach((t) => t.stop()); a.ctx.close(); audioRef.current = null; }
  function capture(kind: 'low' | 'high') { if (!stableMidi || !currentFrequency) return; const item = { midi: stableMidi, note: midiToBrazilianNoteName(stableMidi), frequency: currentFrequency }; kind === 'low' ? setLowest((old) => !old || item.midi < old.midi ? item : old) : setHighest((old) => !old || item.midi > old.midi ? item : old); }
  function playNote(midi: number) { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'triangle'; osc.frequency.value = midiToFrequency(midi); gain.gain.setValueAtTime(0.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.04); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1); }
  function resetAll() { setLowest(null); setHighest(null); setTessHigh(null); setTessLow(null); setSaveMessage(''); setTessituraSteps([]); setStep('intro'); stopMic(); }
  async function save() {
    if (validation) { setSaveMessage(validation); return; }
    setSaving(true); setSaveMessage('');
    const payload = { profileId, authUserId, lowest, highest, tessituraLowMidi: tessLow, tessituraHighMidi: tessHigh, gender, classification: result.classification, confidence: result.confidence, tessituraSteps, userAgent: navigator.userAgent };
    const response = await fetch('/api/vocal-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSaving(false);
    setSaveMessage(response.ok ? 'Mapa Vocal salvo no seu perfil.' : 'Não foi possível salvar agora. Tente novamente.');
  }

  const canCapture = stableMidi != null;
  return <div className="vocal-test-shell">
    <style>{css}</style>
    {step === 'intro' && <section className="vocal-stage hero"><Sparkles size={34} /><h1>Vamos criar seu Mapa Vocal</h1><p>Esse teste identifica sua extensão, sua tessitura confortável e uma tendência vocal aproximada.</p><p className="tip">Não force. Técnica vocal é consciência, não violência.</p>{micError && <strong className="error">{micError}</strong>}<button onClick={startMic} aria-label="Iniciar avaliação vocal"><Mic2 /> Iniciar avaliação</button></section>}
    {(step === 'lowest' || step === 'highest') && <section className="vocal-stage grid"><div><p className="eyebrow">{step === 'lowest' ? 'Etapa 1' : 'Etapa 2'}</p><h1>{step === 'lowest' ? 'Cante sua nota mais grave' : 'Cante sua nota mais aguda'}</h1><p>{step === 'lowest' ? 'Emita a nota mais grave que você consegue sustentar por alguns segundos, sem forçar.' : 'Busque sua nota mais alta possível, sem dor e sem tensão excessiva.'}</p><div className="readout"><strong>{currentMidi ? midiToBrazilianNoteName(currentMidi) : '—'}</strong><span>{currentFrequency ? `${currentFrequency.toFixed(1)} Hz` : 'Aguardando voz'}</span><small>{canCapture ? 'Pitch estável detectado' : 'Sustente por alguns instantes para capturar'}</small></div><div className="actions"><button disabled={!canCapture} onClick={() => capture(step === 'lowest' ? 'low' : 'high')}><Check /> Capturar nota</button><button onClick={() => step === 'lowest' ? setLowest(null) : setHighest(null)}><RefreshCw /> Refazer</button><button disabled={step === 'lowest' ? !lowest : !highest} onClick={() => step === 'lowest' ? setStep('highest') : setStep('confirm-range')}>Continuar</button></div></div><VocalNoteMeter currentMidi={currentMidi} lowestMidi={lowest?.midi} highestMidi={highest?.midi} /></section>}
    {step === 'confirm-range' && lowest && highest && <section className="vocal-stage hero"><h1>Confirmar alcance vocal?</h1><div className="range-big">{lowest.note} ↔ {highest.note}</div><p>Extensão mostra tudo que você consegue alcançar hoje.</p><div className="actions"><button onClick={() => setStep('lowest')}><RefreshCw /> Refazer</button><button onClick={() => { stopMic(); setTessHigh(highest.midi); setTessLow(lowest.midi); setStep('tess-high'); }}><Check /> Confirmar</button></div></section>}
    {step === 'tess-high' && highest && tessHigh != null && <Tessitura title="Agora vamos encontrar seu agudo confortável" text="O sistema vai partir da sua nota mais alta. Cante uma frase curta nessa nota e diga se ela saiu com conforto e qualidade." midi={tessHigh} lowestMidi={lowest?.midi} highestMidi={highest?.midi} phrase="Eu consigo cantar com qualidade" downLabel="Descer meio tom" onPlay={playNote} onMove={() => { setTessHigh(Math.max(lowest?.midi ?? 24, tessHigh - 1)); setTessituraSteps((s) => [...s, { area: 'high', action: 'down', midi: tessHigh - 1 }]); }} onConfirm={() => setStep('tess-low')} />}
    {step === 'tess-low' && lowest && tessLow != null && <Tessitura title="Agora vamos encontrar seu grave confortável" text="Cante a frase com presença e clareza. Se estiver soproso, fraco ou desconfortável, suba meio tom." midi={tessLow} lowestMidi={lowest?.midi} highestMidi={highest?.midi} phrase="Eu consigo cantar com qualidade" downLabel="Subir meio tom" icon="up" onPlay={playNote} onMove={() => { setTessLow(Math.min(highest?.midi ?? 96, tessLow + 1)); setTessituraSteps((s) => [...s, { area: 'low', action: 'up', midi: tessLow + 1 }]); }} onConfirm={() => setStep('gender')} />}
    {step === 'gender' && <section className="vocal-stage hero"><h1>Selecione uma referência vocal</h1><p>Essa informação ajuda apenas a estimar melhor a tendência vocal.</p><div className="choice-grid">{[['masculino','Masculino'],['feminino','Feminino'],['nao_informar','Prefiro não informar']].map(([value,label]) => <button className={gender === value ? 'selected' : ''} key={value} onClick={() => setGender(value as Gender)}>{label}</button>)}</div><button onClick={() => setStep('result')}>Ver resultado</button></section>}
    {step === 'result' && lowest && highest && <section className="vocal-stage hero result"><h1>Seu Mapa Vocal</h1><div className="result-grid"><article><span>Extensão</span><strong>{lowest.note} → {highest.note}</strong></article><article><span>Tessitura confortável</span><strong>{tessLow != null ? midiToBrazilianNoteName(tessLow) : '—'} → {tessHigh != null ? midiToBrazilianNoteName(tessHigh) : '—'}</strong></article><article><span>Tendência vocal</span><strong>{result.classification}</strong></article><article><span>Confiança</span><strong>{Math.round(result.confidence * 100)}%</strong></article></div><p>Essa é uma leitura inicial. Sua voz pode evoluir conforme técnica, saúde vocal, aquecimento, consciência corporal e treino.</p>{validation && <strong className="error">{validation}</strong>}{saveMessage && <strong className="save-message">{saveMessage}</strong>}<div className="actions"><button disabled={saving || Boolean(validation)} onClick={save}><Save /> {saving ? 'Salvando...' : 'Salvar no meu perfil'}</button><button onClick={resetAll}><RefreshCw /> Refazer avaliação</button><Link href="/aluno/biblioteca">Ver aulas recomendadas</Link></div></section>}
  </div>;
}

function Tessitura({ title, text, midi, lowestMidi, highestMidi, phrase, downLabel, icon, onPlay, onMove, onConfirm }: any) { return <section className="vocal-stage tessitura-grid"><div className="tessitura-copy"><h1>{title}</h1><p>{text}</p><small>Use volume moderado.</small><div className="range-big">{midiToBrazilianNoteName(midi)}</div><blockquote>“{phrase}”</blockquote><div className="actions"><button onClick={() => onPlay(midi)}><Play /> Tocar nota</button><button onClick={onConfirm}><Check /> Consegui com conforto</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} Difícil / sem qualidade</button><button onClick={onMove}>{icon === 'up' ? <ArrowUp /> : <ArrowDown />} {downLabel}</button></div></div><VocalNoteMeter currentMidi={midi} lowestMidi={lowestMidi} highestMidi={highestMidi} /></section>; }

const css = `.vocal-test-shell{min-height:100dvh;padding:18px 14px 110px;color:#fff;background:radial-gradient(circle at 70% 5%,rgba(42,204,221,.2),transparent 28%),radial-gradient(circle at 10% 15%,rgba(245,199,107,.18),transparent 32%),#050507}.vocal-stage{max-width:1120px;margin:0 auto;border:1px solid rgba(255,255,255,.12);border-radius:30px;background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.45);padding:24px}.vocal-stage.hero{text-align:center;display:grid;gap:18px;place-items:center}.vocal-stage.grid,.vocal-stage.tessitura-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(330px,1.1fr);gap:20px;align-items:stretch}.tessitura-copy{text-align:center;display:grid;gap:14px;place-items:center;align-content:center}.vocal-stage h1{margin:0;font-size:clamp(32px,8vw,58px);letter-spacing:-.06em}.vocal-stage p{margin:0;color:rgba(255,255,255,.72);font-size:18px;line-height:1.45}.eyebrow{color:#67e8f9!important;font-size:13px!important;text-transform:uppercase;letter-spacing:.18em;font-weight:1000}.tip,.vocal-stage small{color:#f5c76b!important}.vocal-stage button,.vocal-stage a{border:0;border-radius:18px;padding:15px 18px;background:linear-gradient(180deg,#ffe29a,#e8ad34);color:#120d05;font-weight:950;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:54px}.vocal-stage button:disabled{opacity:.45}.actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.actions button:nth-child(n+2){background:rgba(255,255,255,.09);color:#fff;border:1px solid rgba(255,255,255,.12)}.readout{margin:22px 0;padding:20px;border-radius:24px;background:rgba(0,0,0,.28);display:grid;gap:6px}.readout strong,.range-big{font-size:54px;font-weight:1000;letter-spacing:-.05em;color:#67e8f9}.readout span{color:#f5c76b;font-weight:800}.error{color:#ff8a8a}.save-message{color:#86efac}.choice-grid,.result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:760px}.choice-grid button{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)}.choice-grid .selected{border-color:#67e8f9;box-shadow:0 0 0 3px rgba(103,232,249,.12)}.result-grid{grid-template-columns:repeat(2,1fr)}.result-grid article{border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:18px;background:rgba(0,0,0,.25)}.result-grid span{display:block;color:rgba(255,255,255,.62);margin-bottom:7px}.result-grid strong{font-size:24px}.vocal-meter{position:relative;min-height:560px;border-radius:26px;background:radial-gradient(circle at 50% 40%,rgba(103,232,249,.16),transparent 35%),rgba(0,0,0,.28);overflow:hidden}.vocal-meter-regions{position:absolute;inset:18px 18px 18px 96px;display:grid;grid-template-rows:1fr 1fr 1fr;color:rgba(255,255,255,.28);font-weight:900}.vocal-meter-scale{position:absolute;inset:22px 18px 22px 22px;border-left:2px solid rgba(245,199,107,.35)}.vocal-meter-scale>span{position:absolute;left:12px;transform:translateY(-50%);font-weight:900;color:rgba(255,255,255,.72)}.active-note{position:absolute;left:-10px;width:20px;height:20px;border-radius:50%;transform:translateY(-50%);background:#67e8f9;box-shadow:0 0 22px #67e8f9,0 0 44px rgba(245,199,107,.8)}.marker{position:absolute;right:0;transform:translateY(-50%);font-size:12px;border-radius:999px;padding:5px 8px}.marker.low{background:rgba(245,199,107,.18);color:#f5c76b}.marker.high{background:rgba(103,232,249,.16);color:#67e8f9}blockquote{font-size:22px;color:#fff}@media(max-width:760px){.vocal-stage.grid,.vocal-stage.tessitura-grid{grid-template-columns:1fr}.vocal-stage.grid>div:first-child,.tessitura-copy{order:2}.vocal-stage.grid>.vocal-meter,.tessitura-grid>.vocal-meter{order:1}.vocal-meter{min-height:58vh}.choice-grid,.result-grid{grid-template-columns:1fr}.actions{position:sticky;bottom:12px}.vocal-stage{padding:18px;border-radius:24px}.readout strong,.range-big{font-size:42px}}`;
