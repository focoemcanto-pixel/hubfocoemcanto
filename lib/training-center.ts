export type TrainingNote = {
  pitch: string;
  label?: string;
  start: number;
  duration: number;
  mode?: 'sing' | 'guide';
};

export type TrainingExercise = {
  slug: string;
  title: string;
  categorySlug: string;
  objective: string;
  description: string;
  level: 'Iniciante' | 'Intermediário' | 'Avançado';
  durationLabel: string;
  bpm: number;
  focus: string[];
  audioUrl?: string;
  notes: TrainingNote[];
};

export type TrainingCategory = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  gradient: string;
};

export type DailyTrainingStep = {
  day: number;
  exerciseNumber: number;
  title: string;
  subtitle: string;
  intro: string;
  exerciseSlug: string;
  points: number;
  accent: 'gold' | 'teal' | 'purple';
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DEFAULT_TESSITURA_LOW = 52; // E3
const DEFAULT_TESSITURA_HIGH = 79; // G5

const beat = (bpm: number, beatNumber: number) => (60 / bpm) * beatNumber;

function midiToPitch(midi: number) {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

function buildBeatGridNotes(bpm: number, pitches: string[], beatsPerNote = 4): TrainingNote[] {
  return pitches.map((pitch, index) => ({
    pitch,
    label: 'NG',
    start: beat(bpm, index * beatsPerNote),
    duration: beat(bpm, beatsPerNote),
  }));
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

function buildAdaptiveFiveToneWarmup({ bpm, lowMidi = DEFAULT_TESSITURA_LOW, highMidi = DEFAULT_TESSITURA_HIGH, beatsPerNote = 1 }: { bpm: number; lowMidi?: number; highMidi?: number; beatsPerNote?: number }): TrainingNote[] {
  const pattern = [0, 2, 4, 5, 7, 5, 4, 2, 0];
  const maxPatternInterval = Math.max(...pattern);
  const highestStart = Math.max(lowMidi, highMidi - maxPatternInterval);
  const startsUp = Array.from({ length: highestStart - lowMidi + 1 }, (_, index) => lowMidi + index);
  const startsDown = startsUp.slice(0, -1).reverse();
  const starts = [...startsUp, ...startsDown];
  const notes: TrainingNote[] = [];
  let beatCursor = 0;

  starts.forEach((rootMidi, phraseIndex) => {
    pattern.forEach((interval) => {
      notes.push({
        pitch: midiToPitch(rootMidi + interval),
        label: 'Mmm',
        start: beat(bpm, beatCursor),
        duration: beat(bpm, beatsPerNote),
      });
      beatCursor += beatsPerNote;
    });

    const nextRoot = starts[phraseIndex + 1];
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

export const trainingCategories: TrainingCategory[] = [
  { slug: 'afinacao', title: 'Afinação', subtitle: 'Precisão e estabilidade', description: 'Vocalizes guiados para sustentar notas, corrigir oscilações e perceber quando a voz está acima ou abaixo do centro tonal.', icon: '🎯', gradient: 'radial-gradient(circle at 70% 20%,rgba(245,199,107,.38),transparent 38%),linear-gradient(145deg,#33210f,#07070b)' },
  { slug: 'divisao-vocal', title: 'Divisão Vocal', subtitle: 'Segunda voz e independência', description: 'Exercícios para enxergar a linha da segunda voz, treinar entradas e desenvolver segurança em terças, sextas e movimentos contrários.', icon: '🎼', gradient: 'radial-gradient(circle at 70% 20%,rgba(142,92,255,.38),transparent 38%),linear-gradient(145deg,#211334,#07070b)' },
  { slug: 'respiracao', title: 'Respiração', subtitle: 'Fluxo, apoio e controle', description: 'Treinos com guia visual para inspirar, dosar o ar e sustentar frases longas com mais organização corporal.', icon: '🌬️', gradient: 'radial-gradient(circle at 70% 20%,rgba(55,155,255,.35),transparent 38%),linear-gradient(145deg,#0b203f,#05060a)' },
  { slug: 'extensao-tessitura', title: 'Extensão e Tessitura', subtitle: 'Conforto nos graves e agudos', description: 'Vocalizes progressivos para mapear alcance, fortalecer a passagem e transformar extensão em tessitura utilizável.', icon: '📈', gradient: 'radial-gradient(circle at 70% 20%,rgba(46,213,170,.32),transparent 38%),linear-gradient(145deg,#0d2a22,#05060a)' },
  { slug: 'melismas', title: 'Melismas', subtitle: 'Agilidade e precisão', description: 'Padrões curtos com notas luminosas para treinar coordenação, velocidade e clareza em riffs e runs.', icon: '✨', gradient: 'radial-gradient(circle at 70% 20%,rgba(255,115,115,.30),transparent 38%),linear-gradient(145deg,#2e1111,#05060a)' },
  { slug: 'percepcao', title: 'Percepção', subtitle: 'Ouvido, voz e ritmo', description: 'Perguntas rápidas que mudam todos os dias para treinar memória melódica, direção, ritmo e reconhecimento de notas.', icon: '🎧', gradient: 'radial-gradient(circle at 70% 20%,rgba(255,255,255,.20),transparent 38%),linear-gradient(145deg,#252525,#050505)' },
];

export const trainingExercises: TrainingExercise[] = [
  {
    slug: 'aquecimento-boca-chiusa-5-graus-01',
    title: 'Boca Chiusa: 5 graus',
    categorySlug: 'afinacao',
    objective: 'Aqueça com a boca fechada, sentindo a vibração leve e seguindo o desenho de 5 graus sem apertar a garganta.',
    description: 'Vocalize adaptativo em boca chiusa: sobe cinco graus, desce e transpõe pela região confortável da tessitura, com acordes de preparação entre os tons.',
    level: 'Iniciante',
    durationLabel: 'Adaptativo',
    bpm: 72,
    focus: ['Boca chiusa', 'Aquecimento', '5 graus'],
    notes: buildAdaptiveFiveToneWarmup({ bpm: 72 }),
  },
  {
    slug: 'sustentacao-centro-da-nota-01',
    title: 'Relaxamento com NG',
    categorySlug: 'afinacao',
    objective: 'Cantar cada nota junto ao piano, no tempo do metrônomo, mantendo a voz leve e relaxada.',
    description: 'Exercício inicial em NG para relaxar, sentir o centro da nota e começar o treino sem tensão.',
    level: 'Iniciante',
    durationLabel: '23s',
    bpm: 72,
    focus: ['NG', 'Relaxamento', 'Centro da nota'],
    notes: buildBeatGridNotes(72, ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4'], 4),
  },
  {
    slug: 'controle-melodico-escalas-01',
    title: 'Controle de Altura',
    categorySlug: 'afinacao',
    objective: 'Cantar escalas guiadas dentro da tessitura, mantendo precisão de altura em movimentos ascendentes e descendentes.',
    description: 'Três exercícios melódicos com escala maior, expansão acumulativa e saltos/tríades. As notas são adaptadas à região confortável do aluno.',
    level: 'Iniciante',
    durationLabel: 'Adaptativo',
    bpm: 78,
    focus: ['Controle de altura', 'Escalas', 'Afinação melódica'],
    notes: buildBeatGridNotes(78, ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'], 1),
  },
  {
    slug: 'fluxo-de-ar-4-4-8',
    title: 'Sustentação em S',
    categorySlug: 'respiracao',
    objective: 'Sustentar o fluxo de ar em som de S por 30 segundos, mantendo constância e pouco esforço.',
    description: 'Exercício de apoio respiratório: inspire com calma, solte em S contínuo e mantenha o fluxo até o círculo completar.',
    level: 'Iniciante',
    durationLabel: '30s',
    bpm: 60,
    focus: ['Respiração', 'Sustentação', 'Ssss'],
    notes: [
      { pitch: 'Ssss', label: 'Ssss', start: 0, duration: 30 },
    ],
  },
  {
    slug: 'passagem-suave-escada-01',
    title: 'Passagem suave: escada 01',
    categorySlug: 'extensao-tessitura',
    objective: 'Subir sem empurrar e retornar mantendo conforto.',
    description: 'Visualize a subida como uma escada. A meta não é forçar volume, é manter a sensação organizada em cada degrau.',
    level: 'Intermediário',
    durationLabel: '9 min',
    bpm: 76,
    focus: ['Passagem', 'Agudos', 'Tessitura'],
    notes: buildBeatGridNotes(76, ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4'], 2),
  },
  {
    slug: 'melisma-3-notas-limpeza-01',
    title: 'Melisma 3 notas: limpeza 01',
    categorySlug: 'melismas',
    objective: 'Separar as notas do melisma sem embolar a emissão.',
    description: 'Cada bolinha é um ponto de articulação. Comece lento, mantenha leveza e aumente a velocidade só depois da clareza.',
    level: 'Intermediário',
    durationLabel: '7 min',
    bpm: 92,
    focus: ['Agilidade', 'Clareza', 'Coordenação'],
    notes: buildBeatGridNotes(92, ['E4', 'F4', 'G4', 'F4', 'E4', 'D4', 'E4', 'G4', 'A4'], 1),
  },
  {
    slug: 'percepcao-diaria-iniciante-01',
    title: 'Percepção diária',
    categorySlug: 'percepcao',
    objective: 'Ouça, compare, cante e responda pequenos desafios de percepção musical.',
    description: 'Seis provas curtas com notas, voz, ritmo, piano e memória melódica. As combinações variam automaticamente a cada dia.',
    level: 'Iniciante',
    durationLabel: '3 min',
    bpm: 78,
    focus: ['Percepção', 'Ritmo', 'Memória melódica'],
    notes: buildBeatGridNotes(78, ['C4', 'E4', 'G4'], 1),
  },
];

export const dailyTrainingSteps: DailyTrainingStep[] = [
  { day: 5, exerciseNumber: 1, title: 'Aquecimento: Boca Chiusa', subtitle: 'Prepare sua voz com boca fechada e vibração leve.', intro: 'Faça Mmm com a boca fechada, sem força. Siga o padrão de cinco graus subindo e descendo dentro da sua tessitura.', exerciseSlug: 'aquecimento-boca-chiusa-5-graus-01', points: 50, accent: 'gold' },
  { day: 5, exerciseNumber: 2, title: 'Apoio da Respiração', subtitle: 'Sustente o ar em S contínuo.', intro: 'Inspire com calma e solte em Ssss, mantendo o fluxo constante até o tempo finalizar.', exerciseSlug: 'fluxo-de-ar-4-4-8', points: 60, accent: 'teal' },
  { day: 5, exerciseNumber: 3, title: 'Centro da Afinação', subtitle: 'Cante mirando o centro da nota.', intro: 'Use o piano como referência e mantenha cada nota estável até o final.', exerciseSlug: 'sustentacao-centro-da-nota-01', points: 70, accent: 'gold' },
  { day: 5, exerciseNumber: 4, title: 'Controle de Altura', subtitle: 'Escalas, intervalos e tríades dentro da sua tessitura.', intro: 'Siga as barras melódicas cantando Uhh. O exercício adapta a sequência para a região confortável da sua voz.', exerciseSlug: 'controle-melodico-escalas-01', points: 80, accent: 'gold' },
  { day: 5, exerciseNumber: 5, title: 'Percepção Musical', subtitle: 'Ouça, compare e responda.', intro: 'Complete seis desafios rápidos de percepção. As notas e ritmos mudam todos os dias.', exerciseSlug: 'percepcao-diaria-iniciante-01', points: 90, accent: 'gold' },
];

export function getTrainingCategory(slug: string) { return trainingCategories.find((category) => category.slug === slug); }
export function getTrainingExercise(slug: string) { return trainingExercises.find((exercise) => exercise.slug === slug); }
export function getExercisesByCategory(categorySlug: string) { return trainingExercises.filter((exercise) => exercise.categorySlug === categorySlug); }
export function getTrainingDurationSeconds(exercise: TrainingExercise) { return Math.ceil(Math.max(...exercise.notes.map((note) => note.start + note.duration), 0)); }
export function getDailyTrainingStep(exerciseNumber: number) { return dailyTrainingSteps.find((step) => step.exerciseNumber === exerciseNumber); }
export function getDailyTrainingExercise(step: DailyTrainingStep) { return getTrainingExercise(step.exerciseSlug); }
