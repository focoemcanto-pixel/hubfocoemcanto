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

type Candidate = { lag: number; score: number };

type DetectionCore = {
  frequencyHz: number;
  confidence: number;
  rms: number;
  peak: number;
};

function analyzeLevel(buffer: Float32Array) {
  let sum = 0;
  let peak = 0;
  let mean = 0;
  for (let i = 0; i < buffer.length; i += 1) mean += buffer[i];
  mean /= Math.max(1, buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    const value = buffer[i] - mean;
    sum += value * value;
    const abs = Math.abs(value);
    if (abs > peak) peak = abs;
  }
  return { rms: Math.sqrt(sum / Math.max(1, buffer.length)), peak, mean };
}

function prepareBuffer(buffer: Float32Array, mean: number, peak: number) {
  const prepared = new Float32Array(buffer.length);
  const clip = Math.max(0.0025, peak * 0.11);
  for (let i = 0; i < buffer.length; i += 1) {
    const value = buffer[i] - mean;
    if (value > clip) prepared[i] = value - clip;
    else if (value < -clip) prepared[i] = value + clip;
    else prepared[i] = 0;
  }
  return prepared;
}

function normalizedCorrelation(buffer: Float32Array, lag: number) {
  let correlation = 0;
  let energyA = 0;
  let energyB = 0;
  const limit = buffer.length - lag;
  if (limit <= 16) return 0;
  for (let i = 0; i < limit; i += 1) {
    const a = buffer[i];
    const b = buffer[i + lag];
    correlation += a * b;
    energyA += a * a;
    energyB += b * b;
  }
  const denom = Math.sqrt(energyA * energyB);
  return denom > 1e-9 ? correlation / denom : 0;
}

function refineLag(buffer: Float32Array, lag: number, minLag: number, maxLag: number) {
  if (lag <= minLag || lag >= maxLag) return lag;
  const left = normalizedCorrelation(buffer, lag - 1);
  const center = normalizedCorrelation(buffer, lag);
  const right = normalizedCorrelation(buffer, lag + 1);
  const divisor = 2 * (left - 2 * center + right);
  if (!divisor) return lag;
  const adjustment = (left - right) / divisor;
  return Number.isFinite(adjustment) && Math.abs(adjustment) <= 1 ? lag + adjustment : lag;
}

function findCandidates(buffer: Float32Array, sampleRate: number) {
  const minFrequency = 28;
  const maxFrequency = 1900;
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(buffer.length - 8, Math.ceil(sampleRate / minFrequency));
  const scores = new Float32Array(maxLag + 2);
  let best: Candidate | null = null;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const score = normalizedCorrelation(buffer, lag);
    scores[lag] = score;
    if (!best || score > best.score) best = { lag, score };
  }

  const candidates: Candidate[] = [];
  for (let lag = minLag + 1; lag < maxLag - 1; lag += 1) {
    const score = scores[lag];
    if (score < 0.18) continue;
    if (score >= scores[lag - 1] && score >= scores[lag + 1]) candidates.push({ lag, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return { candidates, best, minLag, maxLag, scores };
}

function chooseVocalCandidate(candidates: Candidate[], best: Candidate | null, sampleRate: number) {
  if (!best) return null;
  const bestFrequency = sampleRate / best.lag;
  const lowFriendly = bestFrequency < 95;
  const absoluteFloor = lowFriendly ? 0.2 : 0.28;
  if (best.score < absoluteFloor) return null;

  let chosen = best;
  const sortedByLagDesc = [...candidates].sort((a, b) => b.lag - a.lag);

  for (const candidate of sortedByLagDesc) {
    const frequency = sampleRate / candidate.lag;
    if (frequency < 28 || frequency > 1900) continue;
    if (candidate.lag <= chosen.lag) continue;

    const octaveRelated = Math.abs(candidate.lag / chosen.lag - 2) < 0.2 || Math.abs(candidate.lag / chosen.lag - 3) < 0.24 || Math.abs(candidate.lag / chosen.lag - 4) < 0.28;
    const veryLowVocal = frequency < 90;
    const closeEnough = candidate.score >= chosen.score * (veryLowVocal ? 0.54 : 0.72);
    const reliableEnough = candidate.score >= (veryLowVocal ? 0.2 : 0.32);

    if ((octaveRelated || veryLowVocal) && closeEnough && reliableEnough) {
      chosen = candidate;
    }
  }

  return chosen;
}

function detectPitchCore(buffer: Float32Array, sampleRate: number): DetectionCore | null {
  const { rms, peak, mean } = analyzeLevel(buffer);
  if (rms < 0.0017 || peak < 0.006) return null;

  const prepared = prepareBuffer(buffer, mean, peak);
  const { candidates, best, minLag, maxLag } = findCandidates(prepared, sampleRate);
  const chosen = chooseVocalCandidate(candidates, best, sampleRate);
  if (!chosen) return null;

  const refinedLag = refineLag(prepared, chosen.lag, minLag, maxLag);
  const frequencyHz = sampleRate / refinedLag;
  if (!Number.isFinite(frequencyHz) || frequencyHz < 28 || frequencyHz > 1900) return null;

  const lowBonus = frequencyHz < 90 ? 0.07 : 0;
  const volumeBonus = Math.min(0.08, rms * 2.2);
  const confidence = Math.max(0, Math.min(1, chosen.score + lowBonus + volumeBonus));
  if (confidence < (frequencyHz < 90 ? 0.23 : 0.3)) return null;

  return { frequencyHz, confidence, rms, peak };
}

export function autoCorrelate(buffer: Float32Array, sampleRate: number): number | null {
  return detectPitchCore(buffer, sampleRate)?.frequencyHz ?? null;
}

export function frequencyToMidiFloat(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function frequencyToMidi(freq: number): number {
  return Math.round(frequencyToMidiFloat(freq));
}

export function detectPitch(buffer: Float32Array, sampleRate: number): PitchDetectionResult | null {
  const detection = detectPitchCore(buffer, sampleRate);
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
