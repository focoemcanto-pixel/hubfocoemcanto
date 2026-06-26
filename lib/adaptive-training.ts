import type { TrainingExercise, TrainingNote } from '@/lib/training-center';

export type VocalTessitura = { lowMidi: number; highMidi: number };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DEFAULT_TESSITURA: VocalTessitura = { lowMidi: 52, highMidi: 67 };

function beat(bpm: number, beatNumber: number) {
  return (60 / bpm) * beatNumber;
}

export function midiToPitch(midi: number) {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

function safeTessitura(value?: Partial<VocalTessitura>): VocalTessitura {
  const low = Number.isFinite(value?.lowMidi) ? Number(value?.lowMidi) : DEFAULT_TESSITURA.lowMidi;
  const high = Number.isFinite(value?.highMidi) ? Number(value?.highMidi) : DEFAULT_TESSITURA.highMidi;
  return {
    lowMidi: Math.max(24, Math.min(96, Math.round(Math.min(low, high)))),
    highMidi: Math.max(24, Math.min(96, Math.round(Math.max(low, high)))),
  };
}

function buildMajorChord(rootMidi: number, bpm: number, beatCursor: number, durationBeats = 0.65): TrainingNote[] {
  return [0, 4, 7].map((interval) => ({
    pitch: midiToPitch(rootMidi + interval),
    label: 'Acorde',
    start: beat(bpm, beatCursor),
    duration: beat(bpm, durationBeats),
    mode: 'guide' as const,
  }));
}

export function buildFiveToneWarmupForTessitura(bpm: number, tessitura?: Partial<VocalTessitura>): TrainingNote[] {
  const safe = safeTessitura(tessitura);
  const pattern = [0, 2, 4, 5, 7, 5, 4, 2, 0];
  const highestRoot = Math.max(safe.lowMidi, safe.highMidi - 7);
  const roots = Array.from({ length: Math.max(1, highestRoot - safe.lowMidi + 1) }, (_, index) => safe.lowMidi + index);
  const notes: TrainingNote[] = [];
  let beatCursor = 0;

  roots.forEach((rootMidi, index) => {
    pattern.forEach((interval) => {
      notes.push({ pitch: midiToPitch(rootMidi + interval), label: 'Mmm', start: beat(bpm, beatCursor), duration: beat(bpm, 1) });
      beatCursor += 1;
    });

    const nextRoot = roots[index + 1];
    if (nextRoot != null) {
      beatCursor += 0.25;
      notes.push(...buildMajorChord(rootMidi, bpm, beatCursor, 0.62));
      beatCursor += 0.72;
      notes.push(...buildMajorChord(nextRoot, bpm, beatCursor, 0.68));
      beatCursor += 1.03;
    }
  });

  return notes;
}

export function personalizeDailyWarmup(exercise: TrainingExercise, tessitura?: Partial<VocalTessitura>): TrainingExercise {
  if (exercise.slug !== 'aquecimento-boca-chiusa-5-graus-01') return exercise;
  const safe = safeTessitura(tessitura);
  const notes = buildFiveToneWarmupForTessitura(exercise.bpm, safe);
  const totalSeconds = Math.ceil(Math.max(...notes.map((note) => note.start + note.duration), 0));

  return {
    ...exercise,
    notes,
    durationLabel: `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`,
    description: `Vocalize adaptativo em boca chiusa pela sua tessitura confortável: ${midiToPitch(safe.lowMidi)} até ${midiToPitch(safe.highMidi)}.`,
  };
}
