export type CourseKey = 'grupo-vip' | 'foco-em-harmonia' | 'foco-em-canto' | 'foco-em-melismas' | 'ebooks';

export const COURSE_ACCESS = [
  {
    key: 'grupo-vip',
    label: 'Grupo VIP',
    shortLabel: 'VIP',
    aliases: [
      'grupo-vip',
      'grupo vip',
      'grupo membros vip',
      'grupo membros vip fh',
      'membros vip',
      'membros vip fh',
      'vip fh',
      'vip foco em canto',
      'vip foco em harmonia',
      'grupo vip foco em harmonia',
      'sala vip',
      'sala de atividades vip',
      'atividades vip',
      'assinatura vip',
      'comunidade vip',
      'membros',
      'membro vip',
      'area vip',
      'área vip',
      'hh r4eym',
      'hhr4eym',
    ],
  },
  { key: 'foco-em-harmonia', label: 'Foco em Harmonia', shortLabel: 'Harmonia', aliases: ['foco-em-harmonia', 'foco em harmonia', 'foco harmonia', 'harmonia vocal', 'segunda voz'] },
  { key: 'foco-em-canto', label: 'Foco em Canto', shortLabel: 'Canto', aliases: ['foco-em-canto', 'foco em canto pro', 'foco em canto', 'upgrade foco em canto', 'tecnica vocal', 'técnica vocal'] },
  { key: 'foco-em-melismas', label: 'Foco em Melismas', shortLabel: 'Melismas', aliases: ['foco-em-melismas', 'foco em melisma', 'foco em melismas', 'melisma', 'melismas'] },
  { key: 'ebooks', label: 'Ebooks e Guias', shortLabel: 'Ebooks', aliases: ['ebooks', 'ebook', 'guia', 'vencendo a rouquidao', 'vencendo a rouquidão'] },
] as const;

export function normalizeProductName(value?: string | null) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('_', ' ').replaceAll('-', ' ').replaceAll('|', ' ').replaceAll('/', ' ').replace(/\s+/g, ' ').trim();
}

export function courseKeyFromProduct(productName?: string | null): CourseKey | 'outros' {
  const normalized = normalizeProductName(productName);
  if (!normalized) return 'outros';
  const found = COURSE_ACCESS.find((course) => course.aliases.some((alias) => normalized.includes(normalizeProductName(alias))));
  return found?.key || 'outros';
}

export function normalizeCourseKey(value?: string | null): CourseKey | 'outros' {
  const direct = COURSE_ACCESS.find((course) => course.key === value)?.key;
  if (direct) return direct;
  return courseKeyFromProduct(value);
}

export function courseLabelFromKey(key?: string | null) {
  return COURSE_ACCESS.find((course) => course.key === normalizeCourseKey(key))?.label || 'Outros produtos';
}

export function courseShortLabelFromKey(key?: string | null) {
  return COURSE_ACCESS.find((course) => course.key === normalizeCourseKey(key))?.shortLabel || 'Outros';
}

export function isAccessActive(status?: string | null) {
  return ['active', 'paid', 'trialing', 'approved'].includes(String(status || '').toLowerCase());
}

export function accessStatusGroup(status?: string | null) {
  const value = String(status || '').toLowerCase();
  if (isAccessActive(value)) return 'ativos';
  if (['late', 'overdue', 'past_due', 'delayed'].includes(value)) return 'atrasados';
  if (['pending', 'waiting_payment', 'waiting'].includes(value)) return 'pendentes';
  if (!value) return 'sem_acesso';
  return 'inativos';
}
