export type VocalGender = 'male' | 'female' | 'unknown';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export type NoteName = `${typeof NOTE_NAMES[number]}${number}`;

export function midiToNote(midi: number) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function noteToMidi(note: string) {
  const match = note.trim().match(/^([A-G])(#?)(-?\d+)$/i);
  if (!match) return null;
  const [, letter, sharp, octaveRaw] = match;
  const normalized = `${letter.toUpperCase()}${sharp || ''}`;
  const index = NOTE_NAMES.indexOf(normalized as (typeof NOTE_NAMES)[number]);
  if (index < 0) return null;
  return (Number(octaveRaw) + 1) * 12 + index;
}

export function frequencyToMidi(frequency: number) {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function frequencyToNote(frequency: number) {
  const midi = frequencyToMidi(frequency);
  const roundedMidi = Math.round(midi);
  return {
    midi,
    roundedMidi,
    note: midiToNote(roundedMidi),
    cents: Math.round((midi - roundedMidi) * 100),
  };
}

export function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteRangeLabel(low?: string | null, high?: string | null) {
  if (!low || !high) return 'Ainda não definido';
  return `${low} → ${high}`;
}

export function clampMidi(value: number, min = 24, max = 97) {
  return Math.max(min, Math.min(max, value));
}

export function estimateVoiceType(gender: VocalGender, comfortableLowMidi?: number | null, comfortableHighMidi?: number | null, rangeLowMidi?: number | null, rangeHighMidi?: number | null) {
  const low = comfortableLowMidi ?? rangeLowMidi;
  const high = comfortableHighMidi ?? rangeHighMidi;
  if (low == null || high == null) return 'Perfil em construção';

  if (gender === 'female') {
    if (high >= 81 && low >= 55) return 'Tendência Soprano';
    if (high >= 76) return 'Tendência Mezzo-soprano';
    return 'Tendência Contralto';
  }

  if (gender === 'male') {
    if (high >= 69 && low >= 48) return 'Tendência Tenor';
    if (high >= 65) return 'Tendência Barítono';
    return 'Tendência Baixo';
  }

  if (high >= 81) return 'Tendência Soprano';
  if (high >= 76) return 'Tendência Mezzo/Aguda';
  if (high >= 69) return 'Tendência Tenor';
  if (high >= 65) return 'Tendência Barítono';
  return 'Tendência Grave';
}

export function registerZoneFromMidi(midi?: number | null) {
  if (midi == null) return 'Aguardando voz';
  if (midi < 48) return 'Grave / Peito';
  if (midi < 60) return 'Médio grave';
  if (midi < 72) return 'Misto / Equilíbrio';
  return 'Agudo / Leve';
}
