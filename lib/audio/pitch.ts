export type VoiceGender = 'masculino' | 'feminino' | 'nao_informar' | null | undefined;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function autoCorrelate(buffer: Float32Array, sampleRate: number): number | null {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.012) return null;

  let start = 0;
  let end = size - 1;
  const threshold = 0.2;
  for (let i = 0; i < size / 2; i += 1) {
    if (Math.abs(buffer[i]) < threshold) { start = i; break; }
  }
  for (let i = 1; i < size / 2; i += 1) {
    if (Math.abs(buffer[size - i]) < threshold) { end = size - i; break; }
  }

  const trimmed = buffer.slice(start, end);
  const trimmedSize = trimmed.length;
  if (trimmedSize < 32) return null;

  const correlations = new Array<number>(trimmedSize).fill(0);
  for (let lag = 0; lag < trimmedSize; lag += 1) {
    for (let i = 0; i < trimmedSize - lag; i += 1) {
      correlations[lag] += trimmed[i] * trimmed[i + lag];
    }
  }

  let d = 0;
  while (d < trimmedSize - 1 && correlations[d] > correlations[d + 1]) d += 1;

  let maxValue = -1;
  let maxPosition = -1;
  for (let i = d; i < trimmedSize; i += 1) {
    if (correlations[i] > maxValue) {
      maxValue = correlations[i];
      maxPosition = i;
    }
  }
  if (maxPosition <= 0) return null;

  const x1 = correlations[maxPosition - 1] || 0;
  const x2 = correlations[maxPosition] || 0;
  const x3 = correlations[maxPosition + 1] || 0;
  const adjustment = (x1 - x3) / (2 * (x1 - 2 * x2 + x3));
  const frequency = sampleRate / (maxPosition + (Number.isFinite(adjustment) ? adjustment : 0));
  return frequency >= 40 && frequency <= 2000 ? frequency : null;
}

export function frequencyToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const note = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${note}${octave}`;
}

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
