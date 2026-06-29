export type VoiceGender = 'masculino' | 'feminino' | 'nao_informar' | null | undefined;
export type VocalRegister = 'chest' | 'mix' | 'head';

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

export type PitchFrame = {
  frequencyHz: number;
  midiFloat: number;
  midiRounded: number;
  noteName: string;
  cents: number;
  confidence: number;
  volume: number;
  rms: number;
};

const MIN_VOICE_FREQUENCY = 35;
const MAX_VOICE_FREQUENCY = 2000;

function removeDc(buffer: Float32Array) {
  let mean = 0;
  for (let i = 0; i < buffer.length; i += 1) mean += buffer[i];
  mean /= Math.max(1, buffer.length);
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) out[i] = buffer[i] - mean;
  return out;
}

function rmsFromBuffer(buffer: Float32Array) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / Math.max(1, buffer.length));
}

function parabolic(values: Float32Array, tau: number) {
  if (tau <= 0 || tau >= values.length - 1) return tau;
  const left = values[tau - 1];
  const center = values[tau];
  const right = values[tau + 1];
  const divisor = left + right - 2 * center;
  if (!divisor) return tau;
  const adjustment = (left - right) / (2 * divisor);
  return Number.isFinite(adjustment) && Math.abs(adjustment) <= 1 ? tau + adjustment : tau;
}

function parabolicPeak(values: Float32Array, tau: number) {
  if (tau <= 0 || tau >= values.length - 1) return tau;
  const left = values[tau - 1];
  const center = values[tau];
  const right = values[tau + 1];
  const divisor = 2 * (2 * center - left - right);
  if (!divisor) return tau;
  const adjustment = (right - left) / divisor;
  return Number.isFinite(adjustment) && Math.abs(adjustment) <= 1 ? tau + adjustment : tau;
}

function mpmPitch(buffer: Float32Array, sampleRate: number) {
  const size = buffer.length;
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_VOICE_FREQUENCY));
  const maxLag = Math.min(size - 2, Math.ceil(sampleRate / MIN_VOICE_FREQUENCY));
  const nsdf = new Float32Array(maxLag + 1);

  for (let tau = 0; tau <= maxLag; tau += 1) {
    let acf = 0;
    let divisor = 0;
    const limit = size - tau;
    for (let i = 0; i < limit; i += 1) {
      const a = buffer[i];
      const b = buffer[i + tau];
      acf += a * b;
      divisor += a * a + b * b;
    }
    nsdf[tau] = divisor > 1e-12 ? (2 * acf) / divisor : 0;
  }

  const peaks: Array<{ tau: number; value: number }> = [];
  let pos = 0;
  while (pos <= maxLag && nsdf[pos] > 0) pos += 1;
  while (pos <= maxLag) {
    while (pos <= maxLag && nsdf[pos] <= 0) pos += 1;
    if (pos > maxLag) break;
    let maxTau = pos;
    let maxValue = nsdf[pos];
    while (pos <= maxLag && nsdf[pos] > 0) {
      if (nsdf[pos] > maxValue) { maxValue = nsdf[pos]; maxTau = pos; }
      pos += 1;
    }
    if (maxTau >= minLag) peaks.push({ tau: maxTau, value: maxValue });
  }

  if (!peaks.length) return null;
  const highest = Math.max(...peaks.map((peak) => peak.value));
  const selected = peaks.find((peak) => peak.value >= highest * 0.86 && peak.value > 0.36) || peaks.find((peak) => peak.value > 0.28);
  if (!selected) return null;
  const refinedTau = parabolicPeak(nsdf, selected.tau);
  const frequency = sampleRate / refinedTau;
  if (frequency < MIN_VOICE_FREQUENCY || frequency > MAX_VOICE_FREQUENCY) return null;
  return { frequency, confidence: Math.max(0, Math.min(1, selected.value)) };
}

function yinPitch(buffer: Float32Array, sampleRate: number) {
  const size = buffer.length;
  const minTau = Math.max(2, Math.floor(sampleRate / MAX_VOICE_FREQUENCY));
  const maxTau = Math.min(size - 2, Math.ceil(sampleRate / MIN_VOICE_FREQUENCY));
  const half = Math.min(maxTau + 1, Math.floor(size / 2));
  if (half <= minTau + 2) return null;

  const difference = new Float32Array(half + 1);
  for (let tau = 1; tau <= half; tau += 1) {
    let sum = 0;
    const limit = size - tau;
    for (let i = 0; i < limit; i += 1) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  const cmnd = new Float32Array(half + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  let bestTau = -1;
  let bestValue = Number.POSITIVE_INFINITY;

  for (let tau = 1; tau <= half; tau += 1) {
    runningSum += difference[tau];
    cmnd[tau] = difference[tau] * tau / Math.max(runningSum, 1e-12);
    if (tau >= minTau && tau <= maxTau && cmnd[tau] < bestValue) { bestValue = cmnd[tau]; bestTau = tau; }
  }

  for (let tau = minTau; tau <= maxTau; tau += 1) {
    if (cmnd[tau] < 0.22) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau += 1;
      const frequency = sampleRate / parabolic(cmnd, tau);
      return frequency >= MIN_VOICE_FREQUENCY && frequency <= MAX_VOICE_FREQUENCY ? { frequency, confidence: 1 - cmnd[tau] } : null;
    }
  }
  if (bestTau > 0 && bestValue < 0.5) {
    const frequency = sampleRate / parabolic(cmnd, bestTau);
    return frequency >= MIN_VOICE_FREQUENCY && frequency <= MAX_VOICE_FREQUENCY ? { frequency, confidence: 1 - bestValue } : null;
  }
  return null;
}

function normalizedCorrelationPitch(buffer: Float32Array, sampleRate: number) {
  const size = buffer.length;
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_VOICE_FREQUENCY));
  const maxLag = Math.min(size - 2, Math.ceil(sampleRate / MIN_VOICE_FREQUENCY));
  let bestCorrelation = 0;
  let bestLag = -1;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;
    const limit = size - lag;
    for (let i = 0; i < limit; i += 1) {
      const a = buffer[i];
      const b = buffer[i + lag];
      correlation += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const normalized = correlation / Math.sqrt(energyA * energyB || 1);
    if (normalized > bestCorrelation) { bestCorrelation = normalized; bestLag = lag; }
  }

  if (bestLag <= 0 || bestCorrelation < 0.18) return null;
  const frequency = sampleRate / bestLag;
  return frequency >= MIN_VOICE_FREQUENCY && frequency <= MAX_VOICE_FREQUENCY ? { frequency, confidence: bestCorrelation } : null;
}

export function detectPitch(buffer: Float32Array, sampleRate: number): PitchFrame | null {
  const rms = rmsFromBuffer(buffer);
  if (rms < 0.0006) return null;
  const clean = removeDc(buffer);
  const result = mpmPitch(clean, sampleRate) || yinPitch(clean, sampleRate) || normalizedCorrelationPitch(clean, sampleRate);
  if (!result) return null;
  const midiFloat = frequencyToMidiFloat(result.frequency);
  const midiRounded = Math.round(midiFloat);
  const cents = (midiFloat - midiRounded) * 100;
  return { frequencyHz: result.frequency, midiFloat, midiRounded, noteName: midiToBrazilianNoteName(midiRounded), cents, confidence: result.confidence, volume: rms, rms };
}

export function autoCorrelate(buffer: Float32Array, sampleRate: number): number | null {
  return detectPitch(buffer, sampleRate)?.frequencyHz ?? null;
}

export function frequencyToMidiFloat(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function frequencyToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
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
