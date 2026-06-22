'use client';

import { Headphones, Mic, Music2, SlidersHorizontal, Sparkles } from 'lucide-react';
import { duetPresets } from './duet-presets';
import type { VoicePreset } from '@/lib/audio/duet-buffer-engine';

type Props = {
  voiceVolume: number;
  referenceVolume: number;
  preset: VoicePreset;
  canLiveEdit: boolean;
  latencyMs?: number;
  noiseReduction?: boolean;
  isAutoMixing?: boolean;
  autoMixMessage?: string;
  onVoiceChange: (value: number) => void;
  onReferenceChange: (value: number) => void;
  onPresetChange: (value: VoicePreset) => void;
  onLatencyChange?: (value: number) => void;
  onNoiseReductionChange?: (value: boolean) => void;
  onAutoMix?: () => void;
  onReset: () => void;
};

export function DuetMixerPanel({
  voiceVolume,
  referenceVolume,
  preset,
  canLiveEdit,
  noiseReduction = false,
  isAutoMixing = false,
  autoMixMessage = '',
  onVoiceChange,
  onReferenceChange,
  onPresetChange,
  onNoiseReductionChange,
  onAutoMix,
  onReset,
}: Props) {
  return (
    <section className="smule-mixer-panel live-smule-panel">
      <header>
        <div>
          <p className="eyebrow">Editor ao vivo</p>
          <h2>Volume e efeito</h2>
        </div>
        <button type="button" onClick={onReset}>Reset</button>
      </header>
      <button type="button" className="duet-premium-action automix-action" onClick={onAutoMix} disabled={!canLiveEdit || isAutoMixing}>
        <Sparkles size={18} />
        <span>
          <strong>{isAutoMixing ? 'Analisando sua voz...' : 'Melhorar automaticamente'}</strong>
          <small>{autoMixMessage || 'Normaliza o ganho das faixas e deixa os volumes prontos.'}</small>
        </span>
      </button>
      <div className="smule-slider-row">
        <span><Mic size={17} /> Voz</span>
        <input type="range" min="0" max="100" value={voiceVolume} onChange={(event) => onVoiceChange(Number(event.target.value))} />
        <strong>{voiceVolume}%</strong>
      </div>
      <div className="smule-slider-row">
        <span><Music2 size={17} /> Referencia</span>
        <input type="range" min="0" max="100" value={referenceVolume} onChange={(event) => onReferenceChange(Number(event.target.value))} />
        <strong>{referenceVolume}%</strong>
      </div>
      <div className="smule-preset-grid">
        {duetPresets.map((item) => (
          <button type="button" className={preset === item.id ? 'active' : ''} onClick={() => onPresetChange(item.id)} key={item.id}>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
      <button type="button" className={`duet-premium-action ${noiseReduction ? 'active' : ''}`} onClick={() => onNoiseReductionChange?.(!noiseReduction)}>
        <SlidersHorizontal size={18} />
        <span>
          <strong>Redutor de ruido</strong>
          <small>{noiseReduction ? 'Ligado no preview e no video final.' : 'Opcional para ambientes com ruido de fundo.'}</small>
        </span>
      </button>
      <p className="smule-note">
        <Headphones size={15} /> {canLiveEdit ? 'As faixas sao normalizadas por ganho interno. Use os sliders apenas para ajuste fino.' : 'Preparando motor de audio profissional...'}
      </p>
    </section>
  );
}
