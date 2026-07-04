import { createAdminClient } from '@/lib/supabase/admin';

export interface BrandingAssetSize {
  width: number;
  height: number;
}

export interface AdminSettings {
  branding: {
    appName: string;
    logoUrl: string;
    faviconUrl: string;
    primaryColor: string;
    loginImageUrl?: string;
    heroImageUrl?: string;
    ogImageUrl?: string;
    logoSize: BrandingAssetSize;
    faviconSize: BrandingAssetSize;
    loginImageSize: BrandingAssetSize;
    heroImageSize: BrandingAssetSize;
    ogImageSize: BrandingAssetSize;
  };
}

const SETTINGS_KEY = 'admin_settings_global';
const STORAGE_BUCKET = 'hub-config';
const STORAGE_PATH = 'settings/admin-settings.json';

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  branding: {
    appName: 'Foco em Canto Academy',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#D4AF37',
    loginImageUrl: '',
    heroImageUrl: '',
    ogImageUrl: '',
    logoSize: { width: 260, height: 78 },
    faviconSize: { width: 512, height: 512 },
    loginImageSize: { width: 1200, height: 1600 },
    heroImageSize: { width: 1920, height: 900 },
    ogImageSize: { width: 1200, height: 630 },
  },
};

const DEFAULT_SETTINGS = DEFAULT_ADMIN_SETTINGS;

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function safeSize(value: unknown, fallback: BrandingAssetSize): BrandingAssetSize {
  const source = value && typeof value === 'object' ? value as Partial<BrandingAssetSize> : {};
  return {
    width: Math.max(40, Math.min(4000, Number(source.width || fallback.width))),
    height: Math.max(20, Math.min(4000, Number(source.height || fallback.height))),
  };
}

function mergeSettings(payload: Partial<AdminSettings> | null | undefined): AdminSettings {
  const branding = payload?.branding ?? {} as Partial<AdminSettings['branding']>;
  return {
    branding: {
      ...DEFAULT_SETTINGS.branding,
      ...branding,
      logoSize: safeSize(branding.logoSize, DEFAULT_SETTINGS.branding.logoSize),
      faviconSize: safeSize(branding.faviconSize, DEFAULT_SETTINGS.branding.faviconSize),
      loginImageSize: safeSize(branding.loginImageSize, DEFAULT_SETTINGS.branding.loginImageSize),
      heroImageSize: safeSize(branding.heroImageSize, DEFAULT_SETTINGS.branding.heroImageSize),
      ogImageSize: safeSize(branding.ogImageSize, DEFAULT_SETTINGS.branding.ogImageSize),
    },
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
  return message.includes('hub_settings') || message.includes('schema cache') || message.includes('does not exist') || message.includes('Could not find') || message.includes('supabaseUrl is required') || message.includes('supabaseKey is required');
}

async function ensureConfigBucket() {
  if (!hasSupabaseEnv()) return false;
  const supabase = createAdminClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.id === STORAGE_BUCKET || bucket.name === STORAGE_BUCKET);
  if (exists) return true;
  const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, { public: false });
  return !error;
}

async function getSettingsFromStorage(): Promise<AdminSettings | null> {
  if (!hasSupabaseEnv()) return null;
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
  if (!hasSupabaseEnv()) return;
  const supabase = createAdminClient();
  await ensureConfigBucket();
  const body = JSON.stringify(mergeSettings(payload), null, 2);
  await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_PATH, body, {
    contentType: 'application/json; charset=utf-8',
    upsert: true,
  });
}

async function getSettingsFromDatabase(): Promise<AdminSettings | null> {
  if (!hasSupabaseEnv()) return null;
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
  if (!hasSupabaseEnv()) return;
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
  if (!hasSupabaseEnv()) return DEFAULT_SETTINGS;
  try {
    return (await getSettingsFromDatabase()) ?? (await getSettingsFromStorage()) ?? DEFAULT_SETTINGS;
  } catch (error) {
    if (!isMissingSettingsTable(error)) console.error('Falha ao carregar configurações do Hub', error);
  }

  return (await getSettingsFromStorage()) ?? DEFAULT_SETTINGS;
}

export async function saveAdminSettings(payload: AdminSettings): Promise<void> {
  const next = mergeSettings(payload);
  if (!hasSupabaseEnv()) return;
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
