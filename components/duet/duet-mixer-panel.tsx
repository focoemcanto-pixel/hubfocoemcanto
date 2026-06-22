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
      <button type="button" className="noise-reduction-toggle compact active" onClick={onAutoMix} disabled={!canLiveEdit || isAutoMixing}>
        <Sparkles size={18} />
        <span>
          <strong>{isAutoMixing ? 'Analisando sua voz...' : 'Melhorar automaticamente'}</strong>
          <small>{autoMixMessage || 'Equilibra voz e referência sem precisar mexer nos sliders.'}</small>
        </span>
      </button>
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
      <div className="smule-preset-grid">
        {duetPresets.map((item) => (
          <button type="button" className={preset === item.id ? 'active' : ''} onClick={() => onPresetChange(item.id)} key={item.id}>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
      <button type="button" className={`noise-reduction-toggle compact ${noiseReduction ? 'active' : ''}`} onClick={() => onNoiseReductionChange?.(!noiseReduction)}>
        <SlidersHorizontal size={18} />
        <span>
          <strong>Redução de ruído</strong>
          <small>{noiseReduction ? 'Ligada no preview e no vídeo final.' : 'Opcional. Use só se houver ruído de fundo.'}</small>
        </span>
      </button>
      <p className="smule-note">
        <Headphones size={15} /> {canLiveEdit ? 'O Hub já aplica tratamento interno. Use o AutoMix e ajuste manualmente só se quiser.' : 'Preparando motor de audio profissional...'}
      </p>
    </section>
  );
}
