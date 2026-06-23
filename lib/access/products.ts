export type CourseKey = 'grupo-vip' | 'foco-em-harmonia' | 'foco-em-canto' | 'foco-em-melismas' | 'ebooks';

export const COURSE_ACCESS = [
  { key: 'grupo-vip', label: 'Grupo VIP', shortLabel: 'VIP', aliases: ['grupo membros vip', 'membros vip', 'grupo vip', 'vip fh'] },
  { key: 'foco-em-harmonia', label: 'Foco em Harmonia', shortLabel: 'Harmonia', aliases: ['foco em harmonia', 'foco harmonia'] },
  { key: 'foco-em-canto', label: 'Foco em Canto', shortLabel: 'Canto', aliases: ['foco em canto pro', 'foco em canto', 'upgrade foco em canto'] },
  { key: 'foco-em-melismas', label: 'Foco em Melismas', shortLabel: 'Melismas', aliases: ['foco em melisma', 'foco em melismas', 'melisma', 'melismas'] },
  { key: 'ebooks', label: 'Ebooks e Guias', shortLabel: 'Ebooks', aliases: ['ebook', 'ebooks', 'guia', 'vencendo a rouquidao', 'vencendo a rouquidao'] },
] as const;

export function normalizeProductName(value?: string | null) {
  return String(value || '').toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ').replaceAll('|', ' ').replaceAll('/', ' ').replaceAll('  ', ' ').trim();
}

export function courseKeyFromProduct(productName?: string | null): CourseKey | 'outros' {
  const normalized = normalizeProductName(productName);
  if (!normalized) return 'outros';
  const found = COURSE_ACCESS.find((course) => course.aliases.some((alias) => normalized.includes(normalizeProductName(alias))));
  return found?.key || 'outros';
}

export function courseLabelFromKey(key?: string | null) {
  return COURSE_ACCESS.find((course) => course.key === key)?.label || 'Outros produtos';
}

export function courseShortLabelFromKey(key?: string | null) {
  return COURSE_ACCESS.find((course) => course.key === key)?.shortLabel || 'Outros';
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
