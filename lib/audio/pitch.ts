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

type PitchCandidate = {
  frequencyHz: number;
  midiFloat: number;
  confidence: number;
  source: 'mpm' | 'yin' | 'acf';
};

type PitchFrame = {
  frequencyHz: number;
  midiFloat: number;
  confidence: number;
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

const MIN_VOCAL_FREQUENCY = 24;
const MAX_VOCAL_FREQUENCY = 1800;
const SILENCE_RMS = 0.0048;
const SILENCE_PEAK = 0.018;

function rmsFromBuffer(buffer: Float32Array) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / Math.max(1, buffer.length));
}

function signalStats(buffer: Float32Array) {
  let mean = 0;
  let peak = 0;
  for (let i = 0; i < buffer.length; i += 1) mean += buffer[i];
  mean /= Math.max(1, buffer.length);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const value = buffer[i] - mean;
    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  return { mean, rms: Math.sqrt(sum / Math.max(1, buffer.length)), peak };
}

function makeAnalysisBuffer(buffer: Float32Array, mean: number) {
  const out = new Float32Array(buffer.length);
  const last = buffer.length - 1;
  for (let i = 0; i < buffer.length; i += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, last));
    out[i] = (buffer[i] - mean) * window;
  }
  return out;
}

function parabolic(values: ArrayLike<number>, index: number) {
  const left = values[index - 1] ?? values[index];
  const center = values[index];
  const right = values[index + 1] ?? values[index];
  const divisor = left - 2 * center + right;
  if (!divisor) return index;
  const offset = 0.5 * (left - right) / divisor;
  return Number.isFinite(offset) && Math.abs(offset) <= 1 ? index + offset : index;
}

function confidenceFloor(frequencyHz: number) {
  if (frequencyHz < 45) return 0.72;
  if (frequencyHz < 80) return 0.62;
  return 0.5;
}

function addCandidate(list: PitchCandidate[], candidate: PitchCandidate | null) {
  if (!candidate) return;
  if (!Number.isFinite(candidate.frequencyHz) || candidate.frequencyHz < MIN_VOCAL_FREQUENCY || candidate.frequencyHz > MAX_VOCAL_FREQUENCY) return;
  if (candidate.confidence < confidenceFloor(candidate.frequencyHz)) return;
  const existing = list.find((item) => Math.abs(item.midiFloat - candidate.midiFloat) < 0.28);
  if (existing) {
    existing.frequencyHz = (existing.frequencyHz * existing.confidence + candidate.frequencyHz * candidate.confidence) / (existing.confidence + candidate.confidence);
    existing.midiFloat = frequencyToMidiFloat(existing.frequencyHz);
    existing.confidence = Math.min(1, Math.max(existing.confidence, candidate.confidence) + 0.035);
  } else {
    list.push(candidate);
  }
}

function detectMpm(buffer: Float32Array, sampleRate: number): PitchCandidate[] {
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_VOCAL_FREQUENCY));
  const maxLag = Math.min(buffer.length - 2, Math.ceil(sampleRate / MIN_VOCAL_FREQUENCY));
  const nsdf = new Float32Array(maxLag + 2);
  const candidates: PitchCandidate[] = [];

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let acf = 0;
    let divisor = 0;
    const limit = buffer.length - lag;
    for (let i = 0; i < limit; i += 1) {
      const a = buffer[i];
      const b = buffer[i + lag];
      acf += a * b;
      divisor += a * a + b * b;
    }
    nsdf[lag] = divisor > 1e-9 ? (2 * acf) / divisor : 0;
  }

  let bestScore = 0;
  for (let lag = minLag + 1; lag < maxLag - 1; lag += 1) {
    const score = nsdf[lag];
    if (score > bestScore) bestScore = score;
  }
  if (bestScore < 0.45) return candidates;

  const peakFloor = Math.max(0.42, bestScore * 0.72);
  for (let lag = minLag + 1; lag < maxLag - 1; lag += 1) {
    const score = nsdf[lag];
    if (score < peakFloor) continue;
    if (score >= nsdf[lag - 1] && score >= nsdf[lag + 1]) {
      const refined = parabolic(nsdf, lag);
      const frequencyHz = sampleRate / refined;
      candidates.push({ frequencyHz, midiFloat: frequencyToMidiFloat(frequencyHz), confidence: Math.min(1, score), source: 'mpm' });
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

function detectYin(buffer: Float32Array, sampleRate: number): PitchCandidate | null {
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_VOCAL_FREQUENCY));
  const maxLag = Math.min(buffer.length - 2, Math.ceil(sampleRate / MIN_VOCAL_FREQUENCY));
  const yin = new Float32Array(maxLag + 2);
  yin[0] = 1;

  for (let lag = 1; lag <= maxLag; lag += 1) {
    let sum = 0;
    const limit = buffer.length - lag;
    for (let i = 0; i < limit; i += 1) {
      const diff = buffer[i] - buffer[i + lag];
      sum += diff * diff;
    }
    yin[lag] = sum;
  }

  let runningSum = 0;
  for (let lag = 1; lag <= maxLag; lag += 1) {
    runningSum += yin[lag];
    yin[lag] = runningSum ? (yin[lag] * lag) / runningSum : 1;
  }

  let tau = -1;
  const threshold = 0.14;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if (yin[lag] < threshold) {
      tau = lag;
      while (tau + 1 <= maxLag && yin[tau + 1] < yin[tau]) tau += 1;
      break;
    }
  }

  if (tau < 0) {
    let best = 1;
    let bestLag = -1;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      if (yin[lag] < best) { best = yin[lag]; bestLag = lag; }
    }
    if (bestLag < 0 || best > 0.24) return null;
    tau = bestLag;
  }

  const refined = parabolic(yin, tau);
  const frequencyHz = sampleRate / refined;
  const confidence = Math.max(0, Math.min(1, 1 - yin[tau]));
  return { frequencyHz, midiFloat: frequencyToMidiFloat(frequencyHz), confidence, source: 'yin' };
}

function detectNormalizedAcf(buffer: Float32Array, sampleRate: number): PitchCandidate | null {
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_VOCAL_FREQUENCY));
  const maxLag = Math.min(buffer.length - 2, Math.ceil(sampleRate / MIN_VOCAL_FREQUENCY));
  let bestLag = -1;
  let bestScore = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
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
    const score = correlation / Math.sqrt(energyA * energyB || 1);
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }

  if (bestLag <= 0 || bestScore < 0.54) return null;
  const frequencyHz = sampleRate / bestLag;
  return { frequencyHz, midiFloat: frequencyToMidiFloat(frequencyHz), confidence: Math.min(1, bestScore), source: 'acf' };
}

function rawCandidates(buffer: Float32Array, sampleRate: number, rms: number, peak: number) {
  if (rms < SILENCE_RMS || peak < SILENCE_PEAK) return [] as PitchCandidate[];
  const { mean } = signalStats(buffer);
  const analysis = makeAnalysisBuffer(buffer, mean);
  const candidates: PitchCandidate[] = [];
  for (const candidate of detectMpm(analysis, sampleRate)) addCandidate(candidates, candidate);
  addCandidate(candidates, detectYin(analysis, sampleRate));
  addCandidate(candidates, detectNormalizedAcf(analysis, sampleRate));
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function octaveDistance(a: number, b: number) {
  const diff = Math.abs(a - b);
  return Math.min(diff, Math.abs(diff - 12), Math.abs(diff - 24), Math.abs(diff - 36));
}

class VocalPitchTracker {
  private last: PitchFrame | null = null;
  private lastAt = 0;
  private pending: { midi: number; count: number } | null = null;

  reset() {
    this.last = null;
    this.lastAt = 0;
    this.pending = null;
  }

  private scoreCandidate(candidate: PitchCandidate, now: number) {
    if (!this.last || now - this.lastAt > 900) return candidate.confidence;
    const direct = Math.abs(candidate.midiFloat - this.last.midiFloat);
    const octave = octaveDistance(candidate.midiFloat, this.last.midiFloat);
    const continuity = Math.max(0, 1 - Math.min(direct, octave) / 12);
    const octavePenalty = direct > 7 && octave < 1.8 ? 0.02 : 0;
    const jumpPenalty = direct > 9 && octave > 2 ? 0.35 : 0;
    return candidate.confidence + continuity * 0.28 + octavePenalty - jumpPenalty;
  }

  private choose(candidates: PitchCandidate[], now: number) {
    if (!candidates.length) return null;
    const ranked = [...candidates].sort((a, b) => this.scoreCandidate(b, now) - this.scoreCandidate(a, now));
    let chosen = ranked[0];

    if (this.last && now - this.lastAt <= 900) {
      const direct = Math.abs(chosen.midiFloat - this.last.midiFloat);
      const octave = octaveDistance(chosen.midiFloat, this.last.midiFloat);
      if (direct > 9 && octave < 1.4) {
        const adjusted = Math.round((this.last.midiFloat - chosen.midiFloat) / 12) * 12;
        const correctedMidi = chosen.midiFloat + adjusted;
        if (correctedMidi >= frequencyToMidiFloat(MIN_VOCAL_FREQUENCY) && correctedMidi <= frequencyToMidiFloat(MAX_VOCAL_FREQUENCY)) {
          const correctedFrequency = midiToFrequency(correctedMidi);
          chosen = { ...chosen, midiFloat: correctedMidi, frequencyHz: correctedFrequency, confidence: Math.min(1, chosen.confidence + 0.05) };
        }
      }

      const postJump = Math.abs(chosen.midiFloat - this.last.midiFloat);
      if (postJump > 10 && chosen.confidence < 0.84) {
        const rounded = Math.round(chosen.midiFloat);
        if (this.pending && Math.abs(this.pending.midi - rounded) <= 1) this.pending.count += 1;
        else this.pending = { midi: rounded, count: 1 };
        if (this.pending.count < 2) return null;
      } else {
        this.pending = null;
      }
    }

    return chosen;
  }

  accept(candidates: PitchCandidate[], now: number, rms: number): PitchFrame | null {
    const chosen = this.choose(candidates, now);
    if (!chosen) {
      if (this.last && now - this.lastAt < 180) return this.last;
      return null;
    }

    const elapsed = this.lastAt ? Math.max(1 / 120, Math.min(0.08, (now - this.lastAt) / 1000)) : 1 / 60;
    let midiFloat = chosen.midiFloat;

    if (this.last && now - this.lastAt <= 900) {
      const jump = Math.abs(chosen.midiFloat - this.last.midiFloat);
      const speed = jump > 5 ? 0.72 : jump > 1.2 ? 0.58 : 0.42;
      const alpha = Math.max(0.34, Math.min(0.82, speed + chosen.confidence * 0.16 + elapsed * 1.8));
      midiFloat = this.last.midiFloat + (chosen.midiFloat - this.last.midiFloat) * alpha;
    }

    const frame = { frequencyHz: midiToFrequency(midiFloat), midiFloat, confidence: chosen.confidence, rms };
    this.last = frame;
    this.lastAt = now;
    return frame;
  }
}

const globalTracker = new VocalPitchTracker();
let lastSampleRate = 0;

function detectPitchFrame(buffer: Float32Array, sampleRate: number, tracked: boolean): PitchFrame | null {
  const stats = signalStats(buffer);
  if (stats.rms < SILENCE_RMS || stats.peak < SILENCE_PEAK) {
    if (tracked) return globalTracker.accept([], performance.now(), stats.rms);
    return null;
  }

  const candidates = rawCandidates(buffer, sampleRate, stats.rms, stats.peak);
  if (!candidates.length) {
    if (tracked) return globalTracker.accept([], performance.now(), stats.rms);
    return null;
  }

  if (!tracked) {
    const best = candidates[0];
    return { frequencyHz: best.frequencyHz, midiFloat: best.midiFloat, confidence: best.confidence, rms: stats.rms };
  }

  if (lastSampleRate && Math.abs(lastSampleRate - sampleRate) > 1) globalTracker.reset();
  lastSampleRate = sampleRate;
  return globalTracker.accept(candidates, performance.now(), stats.rms);
}

export function autoCorrelate(buffer: Float32Array, sampleRate: number): number | null {
  return detectPitchFrame(buffer, sampleRate, false)?.frequencyHz ?? null;
}

export function frequencyToMidiFloat(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function frequencyToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function detectPitch(buffer: Float32Array, sampleRate: number): PitchDetectionResult | null {
  const frame = detectPitchFrame(buffer, sampleRate, true);
  if (!frame) return null;
  const midiRounded = Math.round(frame.midiFloat);
  const nearestFrequency = midiToFrequency(midiRounded);
  const cents = 1200 * Math.log2(frame.frequencyHz / nearestFrequency);
  return {
    frequencyHz: frame.frequencyHz,
    midiFloat: frame.midiFloat,
    midiRounded,
    noteName: midiToBrazilianNoteName(midiRounded),
    cents,
    confidence: frame.confidence,
    volume: frame.rms,
    rms: frame.rms,
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
