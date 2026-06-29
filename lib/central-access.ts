import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export type CentralAccessLevel = 'open' | 'subscriber' | 'vip' | 'locked';
export type CentralAccessRule = { key: string; level: CentralAccessLevel; note?: string | null; updated_at?: string | null };
export type StudentAccessContext = { email: string; profile: Record<string, any> | null; isSubscriber: boolean; isVip: boolean; isAdmin: boolean };

const allowedLevels: CentralAccessLevel[] = ['open', 'subscriber', 'vip', 'locked'];
const defaultRules: CentralAccessRule[] = [
  { key: 'central', level: 'open', note: 'Acesso geral à Central de Treinamento.' },
  { key: 'daily', level: 'open', note: 'Exercícios diários.' },
  { key: 'personalized', level: 'open', note: 'Treinos personalizados.' },
  { key: 'repertoire', level: 'open', note: 'Estude seu Repertório.' },
];

export function accessLabel(level?: CentralAccessLevel | string | null) {
  if (level === 'subscriber') return 'Assinantes';
  if (level === 'vip') return 'VIP';
  if (level === 'locked') return 'Bloqueado';
  return 'Aberto';
}

function normalizeLevel(value: unknown): CentralAccessLevel {
  return allowedLevels.includes(value as CentralAccessLevel) ? value as CentralAccessLevel : 'open';
}

export async function getCentralAccessRows(): Promise<CentralAccessRule[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('central_access_rules').select('key,level,note,updated_at');
  if (error || !data) return defaultRules;
  const rows = data.map((row: any) => ({ key: String(row.key), level: normalizeLevel(row.level), note: row.note ?? null, updated_at: row.updated_at ?? null }));
  const map = new Map(defaultRules.map((rule) => [rule.key, rule]));
  rows.forEach((row) => map.set(row.key, row));
  return Array.from(map.values());
}

export async function getCentralAccessRules(): Promise<Record<string, CentralAccessLevel>> {
  const rows = await getCentralAccessRows();
  return Object.fromEntries(rows.map((row) => [row.key, row.level])) as Record<string, CentralAccessLevel>;
}

export function levelFor(rules: Record<string, CentralAccessLevel> | CentralAccessRule[], key: string): CentralAccessLevel {
  if (Array.isArray(rules)) return normalizeLevel(rules.find((row) => row.key === key)?.level || 'open');
  return normalizeLevel(rules[key] || 'open');
}

export function getEffectiveLevel(rules: Record<string, CentralAccessLevel> | CentralAccessRule[], keys: Array<string | null | undefined>): CentralAccessLevel {
  const priority: Record<CentralAccessLevel, number> = { open: 0, subscriber: 1, vip: 2, locked: 3 };
  return keys.filter(Boolean).reduce<CentralAccessLevel>((current, key) => {
    const next = levelFor(rules, String(key));
    return priority[next] > priority[current] ? next : current;
  }, 'open');
}

function truthy(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return ['true', '1', 'yes', 'sim', 'active', 'ativo', 'vip', 'subscriber', 'assinante'].includes(value.toLowerCase());
  return false;
}

export async function getStudentAccessContext(): Promise<StudentAccessContext> {
  const cookieStore = await cookies();
  const email = cookieStore.get('hub_access_email')?.value || '';
  const supabase = createAdminClient();
  const { data: profile } = email ? await supabase.from('profiles').select('*').eq('email', email).maybeSingle() : { data: null };
  const source = (profile || {}) as Record<string, any>;
  const role = String(source.role || source.user_role || source.access_role || '').toLowerCase();
  const plan = String(source.plan || source.access_level || source.subscription_tier || source.tier || '').toLowerCase();
  const status = String(source.status || source.subscription_status || source.access_status || '').toLowerCase();
  const isAdmin = ['admin', 'owner', 'professor'].includes(role) || truthy(source.is_admin);
  const isVip = isAdmin || plan.includes('vip') || truthy(source.vip) || truthy(source.is_vip);
  const isSubscriber = isVip || plan.includes('subscriber') || plan.includes('assinante') || status === 'active' || status === 'ativo' || truthy(source.is_subscriber) || truthy(source.subscriber);
  return { email, profile: profile as any, isSubscriber, isVip, isAdmin };
}

export function canAccessLevel(level: CentralAccessLevel | string, ctx: StudentAccessContext) {
  const normalized = normalizeLevel(level);
  if (ctx.isAdmin) return true;
  if (normalized === 'open') return true;
  if (normalized === 'subscriber') return ctx.isSubscriber || ctx.isVip;
  if (normalized === 'vip') return ctx.isVip;
  return false;
}
