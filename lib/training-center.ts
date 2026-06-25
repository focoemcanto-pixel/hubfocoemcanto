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

export const trainingCategories: TrainingCategory[] = [
  {
    slug: 'afinacao',
    title: 'Afinação',
    subtitle: 'Precisão e estabilidade',
    description: 'Vocalizes guiados para sustentar notas, corrigir oscilações e perceber quando a voz está acima ou abaixo do centro tonal.',
    icon: '🎯',
    gradient: 'radial-gradient(circle at 70% 20%,rgba(245,199,107,.38),transparent 38%),linear-gradient(145deg,#33210f,#07070b)',
  },
  {
    slug: 'divisao-vocal',
    title: 'Divisão Vocal',
    subtitle: 'Segunda voz e independência',
    description: 'Exercícios para enxergar a linha da segunda voz, treinar entradas e desenvolver segurança em terças, sextas e movimentos contrários.',
    icon: '🎼',
    gradient: 'radial-gradient(circle at 70% 20%,rgba(142,92,255,.38),transparent 38%),linear-gradient(145deg,#211334,#07070b)',
  },
  {
    slug: 'respiracao',
    title: 'Respiração',
    subtitle: 'Fluxo, apoio e controle',
    description: 'Treinos com guia visual para inspirar, dosar o ar e sustentar frases longas com mais organização corporal.',
    icon: '🌬️',
    gradient: 'radial-gradient(circle at 70% 20%,rgba(55,155,255,.35),transparent 38%),linear-gradient(145deg,#0b203f,#05060a)',
  },
  {
    slug: 'extensao-tessitura',
    title: 'Extensão e Tessitura',
    subtitle: 'Conforto nos graves e agudos',
    description: 'Vocalizes progressivos para mapear alcance, fortalecer a passagem e transformar extensão em tessitura utilizável.',
    icon: '📈',
    gradient: 'radial-gradient(circle at 70% 20%,rgba(46,213,170,.32),transparent 38%),linear-gradient(145deg,#0d2a22,#05060a)',
  },
  {
    slug: 'melismas',
    title: 'Melismas',
    subtitle: 'Agilidade e precisão',
    description: 'Padrões curtos com notas luminosas para treinar coordenação, velocidade e clareza em riffs e runs.',
    icon: '✨',
    gradient: 'radial-gradient(circle at 70% 20%,rgba(255,115,115,.30),transparent 38%),linear-gradient(145deg,#2e1111,#05060a)',
  },
];

export const trainingExercises: TrainingExercise[] = [
  {
    slug: 'sustentacao-centro-da-nota-01',
    title: 'Sustentação: centro da nota 01',
    categorySlug: 'afinacao',
    objective: 'Manter a nota estável, sem cair no final da emissão.',
    description: 'Use as bolinhas como alvo visual: ataque a nota com calma, sustente até o fim da barra luminosa e solte sem tensão.',
    level: 'Iniciante',
    durationLabel: '6 min',
    bpm: 72,
    focus: ['Estabilidade', 'Ouvido', 'Controle'],
    notes: [
      { pitch: 'C4', start: 0, duration: 2 },
      { pitch: 'D4', start: 2.4, duration: 2 },
      { pitch: 'E4', start: 4.8, duration: 2 },
      { pitch: 'F4', start: 7.2, duration: 2 },
      { pitch: 'G4', start: 9.6, duration: 2 },
      { pitch: 'F4', start: 12, duration: 2 },
      { pitch: 'E4', start: 14.4, duration: 2 },
      { pitch: 'D4', start: 16.8, duration: 2 },
      { pitch: 'C4', start: 19.2, duration: 3 },
    ],
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
    notes: [
      { pitch: 'E4', start: 0, duration: 1.4 },
      { pitch: 'F4', start: 1.8, duration: 1.4 },
      { pitch: 'G4', start: 3.6, duration: 1.4 },
      { pitch: 'A4', start: 5.4, duration: 1.4 },
      { pitch: 'G4', start: 7.2, duration: 1.4 },
      { pitch: 'F4', start: 9, duration: 1.4 },
      { pitch: 'E4', start: 10.8, duration: 2.2 },
    ],
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
    notes: [
      { pitch: 'C4', start: 0, duration: 1 },
      { pitch: 'D4', start: 1.2, duration: 1 },
      { pitch: 'E4', start: 2.4, duration: 1 },
      { pitch: 'F4', start: 3.6, duration: 1 },
      { pitch: 'G4', start: 4.8, duration: 1.8 },
      { pitch: 'F4', start: 7, duration: 1 },
      { pitch: 'E4', start: 8.2, duration: 1 },
      { pitch: 'D4', start: 9.4, duration: 1 },
      { pitch: 'C4', start: 10.6, duration: 2 },
    ],
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
    notes: [
      { pitch: 'E4', start: 0, duration: .55 },
      { pitch: 'F4', start: .65, duration: .55 },
      { pitch: 'G4', start: 1.3, duration: .8 },
      { pitch: 'F4', start: 2.4, duration: .55 },
      { pitch: 'E4', start: 3.05, duration: .55 },
      { pitch: 'D4', start: 3.7, duration: .8 },
      { pitch: 'E4', start: 5, duration: .55 },
      { pitch: 'G4', start: 5.65, duration: .55 },
      { pitch: 'A4', start: 6.3, duration: 1.1 },
    ],
  },
];

export function getTrainingCategory(slug: string) {
  return trainingCategories.find((category) => category.slug === slug);
}

export function getTrainingExercise(slug: string) {
  return trainingExercises.find((exercise) => exercise.slug === slug);
}

export function getExercisesByCategory(categorySlug: string) {
  return trainingExercises.filter((exercise) => exercise.categorySlug === categorySlug);
}

export function getTrainingDurationSeconds(exercise: TrainingExercise) {
  return Math.ceil(Math.max(...exercise.notes.map((note) => note.start + note.duration), 0));
}
