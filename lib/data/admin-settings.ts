import { createAdminClient } from '@/lib/supabase/admin';

export interface AdminSettings {
  branding: {
    appName: string;
    logoUrl: string;
    faviconUrl: string;
    primaryColor: string;
    loginImageUrl?: string;
    heroImageUrl?: string;
    ogImageUrl?: string;
  };
}

const SETTINGS_KEY = 'admin_settings_global';
const STORAGE_BUCKET = 'hub-config';
const STORAGE_PATH = 'settings/admin-settings.json';

const DEFAULT_SETTINGS: AdminSettings = {
  branding: {
    appName: 'Foco em Canto Academy',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#D4AF37',
    loginImageUrl: '',
    heroImageUrl: '',
    ogImageUrl: '',
  },
};

function mergeSettings(payload: Partial<AdminSettings> | null | undefined): AdminSettings {
  return {
    branding: { ...DEFAULT_SETTINGS.branding, ...(payload?.branding ?? {}) },
  };
}

function parsePayload(raw: unknown): Partial<AdminSettings> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Partial<AdminSettings>;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Partial<AdminSettings>;
  } catch {
    return null;
  }
}

function isMissingSettingsTable(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as any)?.message || error || '');
  return message.includes('hub_settings') || message.includes('schema cache') || message.includes('does not exist') || message.includes('Could not find');
}

async function ensureConfigBucket() {
  const supabase = createAdminClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.id === STORAGE_BUCKET || bucket.name === STORAGE_BUCKET);
  if (exists) return true;
  const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, { public: false });
  return !error;
}

async function getSettingsFromStorage(): Promise<AdminSettings | null> {
  const supabase = createAdminClient();
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(STORAGE_PATH);
    if (error || !data) return null;
    return mergeSettings(parsePayload(await data.text()));
  } catch {
    return null;
  }
}

async function saveSettingsToStorage(payload: AdminSettings) {
  const supabase = createAdminClient();
  await ensureConfigBucket();
  const body = JSON.stringify(mergeSettings(payload), null, 2);
  await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_PATH, body, {
    contentType: 'application/json; charset=utf-8',
    upsert: true,
  });
}

async function getSettingsFromDatabase(): Promise<AdminSettings | null> {
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from('hub_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return mergeSettings(parsePayload(data?.value));
}

async function saveSettingsToDatabase(payload: AdminSettings) {
  const supabase = createAdminClient() as any;
  const row = {
    key: SETTINGS_KEY,
    value: mergeSettings(payload),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('hub_settings').upsert(row, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    return (await getSettingsFromDatabase()) ?? (await getSettingsFromStorage()) ?? DEFAULT_SETTINGS;
  } catch (error) {
    if (!isMissingSettingsTable(error)) console.error('Falha ao carregar configurações do Hub', error);
  }

  return (await getSettingsFromStorage()) ?? DEFAULT_SETTINGS;
}

export async function saveAdminSettings(payload: AdminSettings): Promise<void> {
  const next = mergeSettings(payload);
  try {
    await saveSettingsToDatabase(next);
  } catch (error) {
    if (!isMissingSettingsTable(error)) console.error('Falha ao salvar configurações no banco. Usando storage.', error);
  }
  await saveSettingsToStorage(next);
}

export async function updateBrandingSettings(branding: Partial<AdminSettings['branding']>): Promise<AdminSettings> {
  const current = await getAdminSettings();
  const next = mergeSettings({ ...current, branding: { ...current.branding, ...branding } });
  await saveAdminSettings(next);
  return next;
}
