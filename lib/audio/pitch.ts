export type VoiceGender = 'masculino' | 'feminino' | 'nao_informar' | null | undefined;
export type VocalRegister = 'chest' | 'mix' | 'head';

export type PitchDetectionResult = {
  frequencyHz: number;
  midiFloat: number;
  midiRounded: number;
  noteName: string;
  cents: number;
  confidence: number;
  volume: number;
  rms: number;
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BRAZILIAN_NOTE_NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
const BRAZILIAN_NOTE_BY_SCIENTIFIC: Record<string, string> = {
  C: 'Dó',
  'C#': 'Dó#',
  D: 'Ré',
  'D#': 'Ré#',
  E: 'Mi',
  F: 'Fá',
  'F#': 'Fá#',
  G: 'Sol',
  'G#': 'Sol#',
  A: 'Lá',
  'A#': 'Lá#',
  B: 'Si'
};

function rmsFromBuffer(buffer: Float32Array) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / Math.max(1, buffer.length));
}

function normalizedCorrelation(buffer: Float32Array, lag: number) {
  let correlation = 0;
  let energyA = 0;
  let energyB = 0;
  const limit = buffer.length - lag;
  for (let i = 0; i < limit; i += 1) {
    const a = buffer[i];
    const b = buffer[i + lag];
    correlation += a * b;
    energyA += a * a;
    energyB += b * b;
  }
  return correlation / Math.sqrt(energyA * energyB || 1);
}

function detectByNormalizedAutocorrelation(buffer: Float32Array, sampleRate: number) {
  const rms = rmsFromBuffer(buffer);
  if (rms < 0.0022) return null;

  const minFrequency = 35;
  const maxFrequency = 2000;
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(buffer.length - 2, Math.ceil(sampleRate / minFrequency));
  let bestCorrelation = 0;
  let bestLag = -1;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const score = normalizedCorrelation(buffer, lag);
    if (score > bestCorrelation) {
      bestCorrelation = score;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestCorrelation < 0.32) return null;

  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const x1 = normalizedCorrelation(buffer, bestLag - 1);
    const x2 = normalizedCorrelation(buffer, bestLag);
    const x3 = normalizedCorrelation(buffer, bestLag + 1);
    const divisor = 2 * (x1 - 2 * x2 + x3);
    const adjustment = divisor ? (x1 - x3) / divisor : 0;
    if (Number.isFinite(adjustment) && Math.abs(adjustment) <= 1) refinedLag = bestLag + adjustment;
  }

  const frequencyHz = sampleRate / refinedLag;
  if (!Number.isFinite(frequencyHz) || frequencyHz < minFrequency || frequencyHz > maxFrequency) return null;
  return { frequencyHz, confidence: Math.max(0, Math.min(1, bestCorrelation)), rms };
}

export function autoCorrelate(buffer: Float32Array, sampleRate: number): number | null {
  return detectByNormalizedAutocorrelation(buffer, sampleRate)?.frequencyHz ?? null;
}

export function frequencyToMidiFloat(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function frequencyToMidi(freq: number): number {
  return Math.round(frequencyToMidiFloat(freq));
}

export function detectPitch(buffer: Float32Array, sampleRate: number): PitchDetectionResult | null {
  const detection = detectByNormalizedAutocorrelation(buffer, sampleRate);
  if (!detection) return null;
  const midiFloat = frequencyToMidiFloat(detection.frequencyHz);
  const midiRounded = Math.round(midiFloat);
  const nearestFrequency = midiToFrequency(midiRounded);
  const cents = 1200 * Math.log2(detection.frequencyHz / nearestFrequency);
  return {
    frequencyHz: detection.frequencyHz,
    midiFloat,
    midiRounded,
    noteName: midiToBrazilianNoteName(midiRounded),
    cents,
    confidence: detection.confidence,
    volume: detection.rms,
    rms: detection.rms,
  };
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToScientificNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const note = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${note}${octave}`;
}

export function midiToBrazilianNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const note = BRAZILIAN_NOTE_NAMES[((rounded % 12) + 12) % 12];
  const scientificOctave = Math.floor(rounded / 12) - 1;
  return `${note}${scientificOctave - 1}`;
}

export function formatBrazilianNote(noteOrMidi: string | number | null | undefined): string {
  if (noteOrMidi == null || noteOrMidi === '') return '—';
  if (typeof noteOrMidi === 'number') return midiToBrazilianNoteName(noteOrMidi);

  const note = noteOrMidi.trim();
  const midi = noteNameToMidi(note);
  if (midi != null) return midiToBrazilianNoteName(midi);

  const match = note.toUpperCase().match(/^([A-G])(#|B)?(-?\d+)$/);
  if (!match) return noteOrMidi;

  const [, letter, accidental = '', octaveText] = match;
  const normalized = `${letter}${accidental === 'B' ? 'b' : accidental}`;
  const flats: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
  const scientificNote = flats[normalized] || normalized;
  const brazilianNote = BRAZILIAN_NOTE_BY_SCIENTIFIC[scientificNote];
  return brazilianNote ? `${brazilianNote}${Number(octaveText) - 1}` : noteOrMidi;
}

export const midiToNoteName = midiToScientificNoteName;

export function noteNameToMidi(note: string): number | null {
  const match = note.trim().toUpperCase().match(/^([A-G])(#|B)?(-?\d+)$/);
  if (!match) return null;
  const [, letter, accidental = '', octaveText] = match;
  const normalized = `${letter}${accidental === 'B' ? 'b' : accidental}`;
  const flats: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
  const noteName = flats[normalized] || normalized;
  const index = NOTE_NAMES.indexOf(noteName);
  if (index < 0) return null;
  return (Number(octaveText) + 1) * 12 + index;
}

export function getVocalRegister(midi?: number | null, gender?: VoiceGender): VocalRegister | null {
  if (midi == null) return null;

  if (gender === 'masculino') {
    if (midi <= 64) return 'chest';
    if (midi <= 71) return 'mix';
    return 'head';
  }

  if (gender === 'feminino') {
    if (midi <= 65) return 'chest';
    if (midi <= 74) return 'mix';
    return 'head';
  }

  if (midi <= 64) return 'chest';
  if (midi <= 72) return 'mix';
  return 'head';
}

export function getVocalRegisterLabel(register?: VocalRegister | null): string {
  if (register === 'chest') return 'Peito';
  if (register === 'mix') return 'Voz mista';
  if (register === 'head') return 'Cabeça';
  return '—';
}

export function classifyVoice(params: { tessituraLowMidi?: number | null; tessituraHighMidi?: number | null; lowestMidi?: number | null; highestMidi?: number | null; gender?: VoiceGender; }): { classification: string; confidence: number } {
  const low = params.tessituraLowMidi;
  const high = params.tessituraHighMidi;
  if (low == null || high == null || low > high) return { classification: 'Indefinida', confidence: 0.55 };
  const span = high - low;
  const coherent = params.lowestMidi == null || params.highestMidi == null || (low >= params.lowestMidi && high <= params.highestMidi);
  const confidence = Math.min(0.85, Math.max(0.55, 0.62 + Math.min(span, 18) / 100 + (coherent ? 0.05 : -0.04)));

  if (params.gender === 'masculino') {
    if (high >= 67 && low >= 48) return { classification: 'Tenor', confidence };
    if (low <= 45 && high <= 64) return { classification: (low + high) / 2 < 54 ? 'Baixo' : 'Barítono', confidence };
    return { classification: 'Barítono', confidence };
  }
  if (params.gender === 'feminino') {
    if (high >= 72) return { classification: 'Soprano', confidence };
    if (low <= 53 && high <= 69) return { classification: 'Contralto', confidence };
    return { classification: 'Mezzo', confidence };
  }
  if (high >= 72) return { classification: 'Voz aguda', confidence: Math.min(confidence, 0.72) };
  if (high <= 64 || low <= 45) return { classification: 'Voz grave', confidence: Math.min(confidence, 0.72) };
  return { classification: 'Voz média', confidence: Math.min(confidence, 0.72) };
}
