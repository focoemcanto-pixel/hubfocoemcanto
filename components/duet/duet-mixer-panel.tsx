'use client';

import { Headphones, Mic, Music2, TimerReset } from 'lucide-react';
import { duetPresets } from './duet-presets';
import type { VoicePreset } from '@/lib/audio/duet-buffer-engine';

type Props = {
  voiceVolume: number;
  referenceVolume: number;
  preset: VoicePreset;
  canLiveEdit: boolean;
  latencyMs?: number;
  onVoiceChange: (value: number) => void;
  onReferenceChange: (value: number) => void;
  onPresetChange: (value: VoicePreset) => void;
  onLatencyChange?: (value: number) => void;
  onReset: () => void;
};

export function DuetMixerPanel({
  voiceVolume,
  referenceVolume,
  preset,
  canLiveEdit,
  latencyMs = 70,
  onVoiceChange,
  onReferenceChange,
  onPresetChange,
  onLatencyChange,
  onReset,
}: Props) {
  return (
    <section className="smule-mixer-panel live-smule-panel">
      <header>
        <div>
          <p className="eyebrow">Editor ao vivo</p>
          <h2>Mexa e ouça na hora</h2>
        </div>
        <button type="button" onClick={onReset}>Reset</button>
      </header>
      <div className="smule-slider-row">
        <span><Mic size={17} /> Voz</span>
        <input type="range" min="0" max="220" value={voiceVolume} onChange={(event) => onVoiceChange(Number(event.target.value))} />
        <strong>{voiceVolume}%</strong>
      </div>
      <div className="smule-slider-row">
        <span><Music2 size={17} /> Referência</span>
        <input type="range" min="0" max="120" value={referenceVolume} onChange={(event) => onReferenceChange(Number(event.target.value))} />
        <strong>{referenceVolume}%</strong>
      </div>
      <div className="smule-slider-row duet-latency-row">
        <span><TimerReset size={17} /> Sincronia</span>
        <input type="range" min="0" max="240" value={latencyMs} onChange={(event) => onLatencyChange?.(Number(event.target.value))} />
        <strong>{latencyMs}ms</strong>
      </div>
      <p className="smule-note">Se a voz ficar atrasada, aumente a sincronia. Se ficar adiantada, reduza.</p>
      <div className="smule-preset-grid">
        {duetPresets.map((item) => (
          <button type="button" className={preset === item.id ? 'active' : ''} onClick={() => onPresetChange(item.id)} key={item.id}>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
      <p className="smule-note">
        <Headphones size={15} /> {canLiveEdit ? 'Toque no play. Sliders, efeitos e sincronia atuam no mesmo clock de audio.' : 'Preparando motor de audio profissional...'}
      </p>
    </section>
  );
}
