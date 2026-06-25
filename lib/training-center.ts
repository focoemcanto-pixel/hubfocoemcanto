export type TrainingNote = {
  pitch: string;
  label?: string;
  start: number;
  duration: number;
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

const beat = (bpm: number, beatNumber: number) => (60 / bpm) * beatNumber;

function buildBeatGridNotes(bpm: number, pitches: string[], beatsPerNote = 4): TrainingNote[] {
  return pitches.map((pitch, index) => ({
    pitch,
    label: 'NG',
    start: beat(bpm, index * beatsPerNote),
    duration: beat(bpm, beatsPerNote),
  }));
}

export const trainingCategories: TrainingCategory[] = [
  { slug: 'afinacao', title: 'Afinação', subtitle: 'Precisão e estabilidade', description: 'Vocalizes guiados para sustentar notas, corrigir oscilações e perceber quando a voz está acima ou abaixo do centro tonal.', icon: '🎯', gradient: 'radial-gradient(circle at 70% 20%,rgba(245,199,107,.38),transparent 38%),linear-gradient(145deg,#33210f,#07070b)' },
  { slug: 'divisao-vocal', title: 'Divisão Vocal', subtitle: 'Segunda voz e independência', description: 'Exercícios para enxergar a linha da segunda voz, treinar entradas e desenvolver segurança em terças, sextas e movimentos contrários.', icon: '🎼', gradient: 'radial-gradient(circle at 70% 20%,rgba(142,92,255,.38),transparent 38%),linear-gradient(145deg,#211334,#07070b)' },
  { slug: 'respiracao', title: 'Respiração', subtitle: 'Fluxo, apoio e controle', description: 'Treinos com guia visual para inspirar, dosar o ar e sustentar frases longas com mais organização corporal.', icon: '🌬️', gradient: 'radial-gradient(circle at 70% 20%,rgba(55,155,255,.35),transparent 38%),linear-gradient(145deg,#0b203f,#05060a)' },
  { slug: 'extensao-tessitura', title: 'Extensão e Tessitura', subtitle: 'Conforto nos graves e agudos', description: 'Vocalizes progressivos para mapear alcance, fortalecer a passagem e transformar extensão em tessitura utilizável.', icon: '📈', gradient: 'radial-gradient(circle at 70% 20%,rgba(46,213,170,.32),transparent 38%),linear-gradient(145deg,#0d2a22,#05060a)' },
  { slug: 'melismas', title: 'Melismas', subtitle: 'Agilidade e precisão', description: 'Padrões curtos com notas luminosas para treinar coordenação, velocidade e clareza em riffs e runs.', icon: '✨', gradient: 'radial-gradient(circle at 70% 20%,rgba(255,115,115,.30),transparent 38%),linear-gradient(145deg,#2e1111,#05060a)' },
];

export const trainingExercises: TrainingExercise[] = [
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
    slug: 'tercas-guiadas-primeira-entrada',
    title: 'Terças guiadas: primeira entrada',
    categorySlug: 'divisao-vocal',
    objective: 'Entender visualmente o caminho da segunda voz em terças.',
    description: 'A linha dourada representa a voz que deve ser cantada. Siga as entradas e perceba a distância entre a melodia base e a divisão.',
    level: 'Iniciante',
    durationLabel: '8 min',
    bpm: 84,
    focus: ['Terças', 'Entrada', 'Independência'],
    notes: buildBeatGridNotes(84, ['E4', 'F4', 'G4', 'A4', 'G4', 'F4', 'E4'], 2),
  },
  {
    slug: 'fluxo-de-ar-4-4-8',
    title: 'Fluxo de ar: 4 • 4 • 8',
    categorySlug: 'respiracao',
    objective: 'Organizar inspiração, suspensão e expiração com controle.',
    description: 'Siga o pulso visual: inspire, sustente e solte o ar em fluxo constante. Ideal antes de vocalizes longos.',
    level: 'Iniciante',
    durationLabel: '5 min',
    bpm: 60,
    focus: ['Apoio', 'Fluxo', 'Preparação'],
    notes: [
      { pitch: 'Inspira', label: 'Inspira', start: 0, duration: 4 },
      { pitch: 'Sustenta', label: 'Segura', start: 4, duration: 4 },
      { pitch: 'Expira', label: 'Solta', start: 8, duration: 8 },
      { pitch: 'Inspira', label: 'Inspira', start: 17, duration: 4 },
      { pitch: 'Sustenta', label: 'Segura', start: 21, duration: 4 },
      { pitch: 'Expira', label: 'Solta', start: 25, duration: 8 },
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
];

export const dailyTrainingSteps: DailyTrainingStep[] = [
  { day: 5, exerciseNumber: 1, title: 'Aquecimento Vocal', subtitle: 'Prepare sua voz para o treino de hoje.', intro: 'Ative a respiração e relaxe a musculatura vocal antes dos exercícios principais.', exerciseSlug: 'sustentacao-centro-da-nota-01', points: 50, accent: 'gold' },
  { day: 5, exerciseNumber: 2, title: 'Controle de Respiração', subtitle: 'Organize o fluxo de ar com precisão.', intro: 'Inspire pelo nariz, sustente com calma e solte o ar mantendo constância.', exerciseSlug: 'fluxo-de-ar-4-4-8', points: 60, accent: 'teal' },
  { day: 5, exerciseNumber: 3, title: 'Centro da Afinação', subtitle: 'Cante mirando o centro da nota.', intro: 'Use o piano como referência e mantenha cada nota estável até o final.', exerciseSlug: 'sustentacao-centro-da-nota-01', points: 70, accent: 'gold' },
  { day: 5, exerciseNumber: 4, title: 'Primeira Segunda Voz', subtitle: 'Visualize a divisão antes de cantar.', intro: 'Siga a linha luminosa e perceba o caminho das terças guiadas.', exerciseSlug: 'tercas-guiadas-primeira-entrada', points: 80, accent: 'purple' },
];

export function getTrainingCategory(slug: string) { return trainingCategories.find((category) => category.slug === slug); }
export function getTrainingExercise(slug: string) { return trainingExercises.find((exercise) => exercise.slug === slug); }
export function getExercisesByCategory(categorySlug: string) { return trainingExercises.filter((exercise) => exercise.categorySlug === categorySlug); }
export function getTrainingDurationSeconds(exercise: TrainingExercise) { return Math.ceil(Math.max(...exercise.notes.map((note) => note.start + note.duration), 0)); }
export function getDailyTrainingStep(exerciseNumber: number) { return dailyTrainingSteps.find((step) => step.exerciseNumber === exerciseNumber); }
export function getDailyTrainingExercise(step: DailyTrainingStep) { return getTrainingExercise(step.exerciseSlug); }
