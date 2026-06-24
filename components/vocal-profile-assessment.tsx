'use client';

import { useMemo, useState } from 'react';
import { estimateVoiceType, midiToNote, noteRangeLabel, type VocalGender } from '@/lib/vocal/notes';

const START_LOW = 41;
const START_HIGH = 73;

type Step = 'range' | 'gender' | 'tessituraHigh' | 'tessituraLow' | 'result';

export function VocalProfileAssessment() {
  const [step, setStep] = useState<Step>('range');
  const [gender, setGender] = useState<VocalGender>('unknown');
  const [lowestMidi, setLowestMidi] = useState(START_LOW);
  const [highestMidi, setHighestMidi] = useState(START_HIGH);
  const [comfortLow, setComfortLow] = useState(START_LOW);
  const [comfortHigh, setComfortHigh] = useState(START_HIGH);
  const voiceType = useMemo(() => estimateVoiceType(gender, comfortLow, comfortHigh, lowestMidi, highestMidi), [gender, comfortLow, comfortHigh, lowestMidi, highestMidi]);
  const range = noteRangeLabel(midiToNote(lowestMidi), midiToNote(highestMidi));
  const tessitura = noteRangeLabel(midiToNote(comfortLow), midiToNote(comfortHigh));

  return (
    <main className="vocal-page">
      <style jsx global>{css}</style>
      <aside className="note-scale">{Array.from({ length: 48 }, (_, i) => 84 - i).map((midi) => <div key={midi} className={midi >= comfortLow && midi <= comfortHigh ? 'comfort' : midi >= lowestMidi && midi <= highestMidi ? 'range' : ''}><span>{midiToNote(midi)}</span><b /></div>)}</aside>
      <section className="vocal-card">
        <small>Mapa Vocal Foco em Canto</small>
        <h1>Perfil Vocal</h1>
        {step === 'range' && <div className="panel"><h2>Extensão vocal</h2><p>Primeiro vamos confirmar a nota mais grave e mais aguda. Esta tela já estrutura o fluxo; o microfone entra na próxima iteração.</p><Picker label="Mais grave" value={lowestMidi} onChange={(v) => { setLowestMidi(v); setComfortLow(v); }} /><Picker label="Mais aguda" value={highestMidi} onChange={(v) => { setHighestMidi(v); setComfortHigh(v); }} /><strong className="big">{range}</strong><button onClick={() => setStep('gender')}>Confirmar extensão</button></div>}
        {step === 'gender' && <div className="panel"><h2>Referência vocal</h2><p>Usaremos isso apenas para estimar uma tendência vocal.</p><div className="actions"><button className={gender === 'male' ? 'selected' : ''} onClick={() => setGender('male')}>Masculino</button><button className={gender === 'female' ? 'selected' : ''} onClick={() => setGender('female')}>Feminino</button></div><button onClick={() => setStep('tessituraHigh')}>Definir tessitura</button></div>}
        {step === 'tessituraHigh' && <div className="panel"><h2>Agudo confortável</h2><p>Cante uma frase nessa nota. Se não sair com conforto e qualidade, desça meio tom.</p><strong className="big">{midiToNote(comfortHigh)}</strong><p className="phrase">“Jesus é fiel”</p><div className="actions"><button className="ghost" onClick={() => setComfortHigh((v) => v - 1)}>Não, descer</button><button onClick={() => setStep('tessituraLow')}>Sim, confirmar</button></div></div>}
        {step === 'tessituraLow' && <div className="panel"><h2>Grave confortável</h2><p>Cante uma frase nessa nota. Se estiver fraco, pesado ou sem clareza, suba meio tom.</p><strong className="big">{midiToNote(comfortLow)}</strong><p className="phrase">“Minha voz está firme”</p><div className="actions"><button className="ghost" onClick={() => setComfortLow((v) => v + 1)}>Não, subir</button><button onClick={() => setStep('result')}>Sim, confirmar</button></div></div>}
        {step === 'result' && <div className="panel"><h2>{voiceType}</h2><div className="results"><article><span>Extensão</span><strong>{range}</strong></article><article><span>Tessitura</span><strong>{tessitura}</strong></article></div><p>Esse resultado será salvo no perfil do aluno e usado para recomendações personalizadas.</p><button onClick={() => setStep('range')}>Refazer avaliação</button></div>}
      </section>
    </main>
  );
}

function Picker({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="picker"><span>{label}</span><button type="button" onClick={() => onChange(value - 1)}>−</button><strong>{midiToNote(value)}</strong><button type="button" onClick={() => onChange(value + 1)}>+</button></label>;
}

const css = `.vocal-page{position:relative;min-height:calc(100vh - 80px);padding:22px 16px 120px 96px;color:#fff;background:linear-gradient(180deg,#09090b,#141418);overflow:hidden}.note-scale{position:absolute;left:10px;top:18px;bottom:100px;width:76px;display:flex;flex-direction:column;justify-content:space-between}.note-scale div{display:grid;grid-template-columns:34px 1fr;gap:7px;align-items:center;font-size:11px;color:rgba(255,255,255,.38)}.note-scale b{height:1px;background:rgba(255,255,255,.22)}.note-scale .range{color:#fff}.note-scale .comfort b{height:2px;background:#f5c76b}.vocal-card{max-width:760px;margin:0 auto}.vocal-card small{color:#f5c76b;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.vocal-card h1{font-size:42px;margin:8px 0 18px;letter-spacing:-.05em}.panel{border:1px solid rgba(255,255,255,.12);background:linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.025));border-radius:28px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.32)}.panel h2{margin:0 0 8px;font-size:28px}.panel p{color:rgba(255,255,255,.7);line-height:1.45}.panel button{border:0;border-radius:16px;padding:14px 18px;background:linear-gradient(180deg,#ffe29a,#ecae35);font-weight:950;color:#130d04}.panel button.ghost{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff}.panel button.selected{outline:2px solid #f5c76b}.big{display:block;margin:12px 0;font-size:38px}.actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.phrase{font-size:24px!important;color:#fff!important;font-weight:950}.results{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.results article{border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:14px;background:rgba(0,0,0,.18)}.results span{display:block;color:rgba(255,255,255,.55);font-size:13px}.results strong{display:block;margin-top:6px}.picker{display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:10px;margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(0,0,0,.18)}.picker span{color:rgba(255,255,255,.65)}.picker strong{font-size:24px}@media(max-width:680px){.vocal-page{padding-left:84px}.vocal-card h1{font-size:34px}.panel{padding:18px}.panel h2{font-size:24px}.actions,.results{grid-template-columns:1fr}}`;
