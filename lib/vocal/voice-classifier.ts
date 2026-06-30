import type { VoiceGender } from '@/lib/audio/pitch';

export type VocalProfileInput = {
  lowestMidi?: number | null;
  highestMidi?: number | null;
  tessituraLowMidi?: number | null;
  tessituraHighMidi?: number | null;
  gender?: VoiceGender;
};

export type VoiceClassification = {
  classification: string;
  confidence: number;
  reasons: string[];
  scores: Record<string, number>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreRange(value: number, min: number, center: number, max: number) {
  if (value < min || value > max) return 0;
  const side = value <= center ? center - min : max - center;
  return clamp(1 - Math.abs(value - center) / Math.max(1, side), 0, 1);
}

function add(score: Record<string, number>, key: string, value: number) {
  score[key] = (score[key] || 0) + value;
}

export function classifyVocalProfile(input: VocalProfileInput): VoiceClassification {
  const low = input.tessituraLowMidi;
  const high = input.tessituraHighMidi;
  const lowest = input.lowestMidi;
  const highest = input.highestMidi;

  if (low == null || high == null || low > high) {
    return { classification: 'Indefinida', confidence: 0.55, reasons: ['Tessitura confortável incompleta.'], scores: {} };
  }

  const span = high - low;
  const center = (low + high) / 2;
  const extensionSpan = lowest != null && highest != null ? highest - lowest : span;
  const coherent = lowest == null || highest == null || (low >= lowest && high <= highest && lowest <= highest);
  const scores: Record<string, number> = {};

  if (input.gender === 'feminino') {
    add(scores, 'Soprano', scoreRange(high, 69, 74, 84) * 2.5 + scoreRange(center, 60, 67, 76));
    add(scores, 'Mezzo', scoreRange(high, 65, 70, 78) * 2 + scoreRange(center, 56, 63, 72));
    add(scores, 'Contralto', scoreRange(high, 59, 65, 72) * 2 + scoreRange(low, 43, 50, 58));
  } else if (input.gender === 'masculino') {
    add(scores, 'Tenor', scoreRange(high, 63, 72, 81) * 2.7 + scoreRange(center, 52, 61, 70) + scoreRange(low, 43, 50, 58) * 0.6);
    add(scores, 'Barítono', scoreRange(high, 57, 64, 72) * 2.25 + scoreRange(center, 47, 56, 64) + scoreRange(low, 38, 45, 53));
    add(scores, 'Baixo', scoreRange(high, 50, 58, 66) * 1.9 + scoreRange(center, 40, 49, 58) + scoreRange(low, 32, 39, 47) * 1.4);
  } else {
    add(scores, 'Voz aguda', scoreRange(high, 66, 75, 86) * 2.4 + scoreRange(center, 56, 66, 78));
    add(scores, 'Voz média', scoreRange(high, 58, 66, 76) * 2 + scoreRange(center, 48, 58, 68));
    add(scores, 'Voz grave', scoreRange(high, 48, 58, 68) * 1.8 + scoreRange(low, 30, 42, 54));
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [winner, topScore = 0] = ranked[0] || ['Indefinida', 0];
  const secondScore = ranked[1]?.[1] || 0;
  const separation = topScore - secondScore;
  const dataQuality = (coherent ? 0.18 : -0.12) + clamp(span / 18, 0, 1) * 0.13 + clamp(extensionSpan / 30, 0, 1) * 0.08;
  const confidence = clamp(0.58 + separation * 0.09 + dataQuality, 0.55, 0.94);

  const reasons = [
    `Tessitura confortável analisada em MIDI real: ${low}–${high}.`,
    `Centro aproximado da tessitura: ${center.toFixed(1)} MIDI.`,
    coherent ? 'A tessitura está dentro da extensão capturada.' : 'A tessitura apresentou inconsistência com a extensão capturada.',
  ];

  if (input.gender === 'masculino' && high >= 67) reasons.push('Agudo confortável compatível com tendência de tenor.');
  if (input.gender === 'masculino' && high <= 64 && center < 58) reasons.push('Região confortável mais central/grave, compatível com barítono ou baixo.');
  if (input.gender === 'feminino' && high >= 72) reasons.push('Agudo confortável compatível com soprano.');

  return { classification: winner, confidence, reasons, scores };
}
