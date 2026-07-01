import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export type CentralAccessLevel = 'open' | 'vip';
export type CentralAccessRule = { key: string; level: CentralAccessLevel; note?: string | null; updated_at?: string | null };
export type StudentAccessContext = { email: string; profile: Record<string, any> | null; isSubscriber: boolean; isVip: boolean; isAdmin: boolean };

const STORAGE_BUCKET = 'hub-config';
const STORAGE_PATH = 'settings/central-access-rules.json';

const defaultRules: CentralAccessRule[] = [
  { key: 'central', level: 'open', note: 'Acesso geral à Central de Treinamento.' },
  { key: 'daily', level: 'open', note: 'Exercícios diários.' },
  { key: 'personalized', level: 'open', note: 'Treinos personalizados.' },
  { key: 'repertoire', level: 'open', note: 'Estude seu Repertório.' },
];

export function accessLabel(level?: CentralAccessLevel | string | null) {
  return normalizeLevel(level) === 'vip' ? 'Grupo VIP' : 'Aberto';
}

function normalizeLevel(value: unknown): CentralAccessLevel {
  const text = String(value || '').toLowerCase();
  return text === 'vip' || text === 'subscriber' || text === 'locked' || text === 'coming_soon' ? 'vip' : 'open';
}

function normalizeRows(rows: any[] | null | undefined): CentralAccessRule[] {
  const map = new Map(defaultRules.map((rule) => [rule.key, rule]));
  (rows || []).forEach((row) => {
    const key = String(row?.key || '').trim();
    if (!key) return;
    map.set(key, { key, level: normalizeLevel(row?.level), note: row?.note ?? null, updated_at: row?.updated_at ?? null });
  });
  return Array.from(map.values());
}

function isMissingTable(error: unknown) {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return message.includes('central_access_rules') || message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find');
}

async function ensureConfigBucket() {
  const supabase = createAdminClient();
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((bucket) => bucket.id === STORAGE_BUCKET || bucket.name === STORAGE_BUCKET);
    if (exists) return true;
    const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, { public: false });
    return !error;
  } catch {
    return false;
  }
}

async function getRowsFromStorage(): Promise<CentralAccessRule[] | null> {
  const supabase = createAdminClient();
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(STORAGE_PATH);
    if (error || !data) return null;
    const parsed = JSON.parse(await data.text());
    return normalizeRows(Array.isArray(parsed) ? parsed : parsed?.rules);
  } catch {
    return null;
  }
}

export async function saveCentralAccessRule(key: string, level: CentralAccessLevel | string, note?: string | null) {
  const nextLevel = normalizeLevel(level);
  const nextRow = { key, level: nextLevel, note: note || null, updated_at: new Date().toISOString() };
  const supabase = createAdminClient();

  let current = await getRowsFromStorage();
  try {
    const { data } = await supabase.from('central_access_rules').select('key,level,note,updated_at');
    current = normalizeRows(data || current || defaultRules);
  } catch {}

  const map = new Map((current || defaultRules).map((row) => [row.key, row]));
  map.set(key, nextRow);
  const rows = Array.from(map.values());
  let saved = false;

  try {
    const { error } = await supabase.from('central_access_rules').upsert(nextRow, { onConflict: 'key' });
    if (!error) saved = true;
    if (error && !isMissingTable(error)) console.error('Falha ao salvar regra da Central no banco', error.message);
  } catch (error) {
    if (!isMissingTable(error)) console.error('Falha ao salvar regra da Central no banco', error);
  }

  try {
    const bucketOk = await ensureConfigBucket();
    if (bucketOk) {
      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_PATH, JSON.stringify({ rules: rows }, null, 2), { contentType: 'application/json; charset=utf-8', upsert: true });
      if (!error) saved = true;
      if (error) console.error('Falha ao salvar regras da Central no storage', error.message);
    }
  } catch (error) {
    console.error('Falha ao salvar regras da Central no storage', error);
  }

  return saved;
}

export async function getCentralAccessRows(): Promise<CentralAccessRule[]> {
  const supabase = createAdminClient();
  try {
    const { data, error } = await supabase.from('central_access_rules').select('key,level,note,updated_at');
    if (!error && data) return normalizeRows(data);
    if (error && !isMissingTable(error)) console.error('Falha ao carregar regras da Central', error.message);
  } catch (error) {
    if (!isMissingTable(error)) console.error('Falha ao carregar regras da Central', error);
  }
  return (await getRowsFromStorage()) ?? defaultRules;
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
  return keys.filter(Boolean).some((key) => levelFor(rules, String(key)) === 'vip') ? 'vip' : 'open';
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
  if (ctx.isAdmin) return true;
  return normalizeLevel(level) === 'open' || ctx.isVip || ctx.isSubscriber;
}
