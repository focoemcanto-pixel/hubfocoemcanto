import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createR2SignedPutUrl } from '@/lib/r2';
import { normalizeR2RuntimeEnv, normalizeRuntimeUrl } from '@/lib/r2-runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ConnectionRow = {
  id: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  token_type?: string | null;
};

type DriveMetadata = {
  mimeType?: string | null;
  size?: string | null;
  name?: string | null;
};

type ExerciseRow = {
  id: string;
  title?: string | null;
  slug?: string | null;
  drive_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  module_id?: string | null;
};

type ModuleRow = {
  id: string;
  title?: string | null;
  slug?: string | null;
};

type ProductRow = {
  id: string;
  name?: string | null;
  slug?: string | null;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function publicR2Base() {
  return normalizeRuntimeUrl(process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '');
}

function isRealR2Url(value?: string | null) {
  const url = String(value || '').trim();
  const base = publicR2Base();
  if (!url || !base) return false;
  return url.startsWith(`${base}/`);
}

function driveFileId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function safeName(value?: string | null) {
  return String(value || 'aula')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'aula';
}

function extensionFromType(contentType: string) {
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('quicktime')) return 'mov';
  if (contentType.includes('webm')) return 'webm';
  if (contentType.includes('mpeg')) return 'mp3';
  if (contentType.includes('wav')) return 'wav';
  return 'mp4';
}

function mediaKind(contentType: string, fallback?: string | null) {
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('video/')) return 'video';
  return fallback || 'video';
}

function mediaFolder(product?: ProductRow | null, module?: ModuleRow | null) {
  const productSlug = safeName(product?.slug || product?.name || 'produto');
  const moduleSlug = safeName(module?.slug || module?.title || 'modulo');
  return `produtos/${productSlug}/${moduleSlug}/originals`;
}

function resultBase(exercise: ExerciseRow, module?: ModuleRow | null) {
  return { id: exercise.id, title: exercise.title, moduleId: exercise.module_id, moduleTitle: module?.title || null };
}

async function loadAccess() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('google_drive_connections')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = data as ConnectionRow | null;
  if (!row?.access_token) throw new Error('drive_not_connected');

  const rowExpiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (rowExpiresAt > Date.now() + 60_000 || !row.refresh_token) {
    cachedAccessToken = { token: row.access_token, expiresAt: rowExpiresAt || Date.now() + 55 * 60 * 1000 };
    return row.access_token;
  }

  const refresh = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!refresh.ok) {
    cachedAccessToken = { token: row.access_token, expiresAt: Date.now() + 5 * 60 * 1000 };
    return row.access_token;
  }

  const json = await refresh.json();
  const expiresAt = Date.now() + Number(json.expires_in || 3600) * 1000;

  await supabase.from('google_drive_connections').upsert({
    id: row.id,
    access_token: json.access_token,
    refresh_token: row.refresh_token,
    scope: json.scope || row.scope,
    token_type: json.token_type || row.token_type,
    expires_at: new Date(expiresAt).toISOString(),
    updated_at: new Date().toISOString(),
  });

  cachedAccessToken = { token: json.access_token as string, expiresAt };
  return json.access_token as string;
}

async function getDriveMetadata(fileId: string, access: string): Promise<DriveMetadata | null> {
  const params = new URLSearchParams({ fields: 'name,mimeType,size', supportsAllDrives: 'true' });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, {
    headers: { authorization: `Bearer ${access}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return response.json() as Promise<DriveMetadata>;
}

async function loadProductScope(productId?: string | null, moduleId?: string | null) {
  const supabase = createAdminClient();
  const product = productId ? ((await supabase.from('products').select('id,name,slug').eq('id', productId).maybeSingle()).data as ProductRow | null) : null;
  const course = productId ? (await supabase.from('courses').select('id').eq('product_id', productId).order('created_at', { ascending: true }).limit(1).maybeSingle()).data : null;

  let moduleIds: string[] = [];
  if (moduleId) moduleIds = [moduleId];
  else if (course?.id) {
    const { data: links } = await supabase.from('course_module_links').select('module_id,sort_order').eq('course_id', course.id).order('sort_order', { ascending: true });
    moduleIds = ((links || []) as { module_id: string }[]).map((link) => String(link.module_id));
  }

  const { data: modulesData } = moduleIds.length
    ? await supabase.from('modules').select('id,title,slug').in('id', moduleIds)
    : await supabase.from('modules').select('id,title,slug');
  const modules = new Map(((modulesData || []) as ModuleRow[]).map((module) => [String(module.id), module]));

  return { product, moduleIds, modules };
}

async function migrateExercise(exercise: ExerciseRow, access: string, product?: ProductRow | null, module?: ModuleRow | null) {
  normalizeR2RuntimeEnv();
  const fileId = driveFileId(exercise.drive_url);
  if (!fileId) return { ...resultBase(exercise, module), status: 'skipped', reason: 'invalid_drive_url' };

  const metadata = await getDriveMetadata(fileId, access);
  const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${access}` },
    cache: 'no-store',
  });

  if (!driveResponse.ok || !driveResponse.body) {
    return { ...resultBase(exercise, module), status: 'failed', reason: `drive_${driveResponse.status}` };
  }

  const contentType = metadata?.mimeType || driveResponse.headers.get('content-type') || 'video/mp4';
  const originalName = metadata?.name || `${safeName(exercise.title || exercise.slug)}.${extensionFromType(contentType)}`;
  const folder = mediaFolder(product, module);
  const signed = await createR2SignedPutUrl({ fileName: originalName, contentType, folder });

  const uploadResponse = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: driveResponse.body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '');
    return { ...resultBase(exercise, module), status: 'failed', reason: `r2_${uploadResponse.status}`, detail: detail.slice(0, 120) };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('exercises')
    .update({ media_url: signed.publicUrl, media_type: mediaKind(contentType, exercise.media_type) })
    .eq('id', exercise.id);

  if (error) return { ...resultBase(exercise, module), status: 'failed', reason: error.message };
  return { ...resultBase(exercise, module), status: 'migrated', mediaUrl: signed.publicUrl, folder, fileName: originalName };
}

export async function POST(request: Request) {
  try {
    normalizeR2RuntimeEnv();
    const cookieStore = await cookies();
    const email = cookieStore.get('hub_access_email')?.value;
    if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as { limit?: number; force?: boolean; exerciseId?: string; productId?: string; moduleId?: string };
    const limit = Math.max(1, Math.min(5, Number(body.limit || 1)));
    const supabase = createAdminClient();
    const scope = await loadProductScope(body.productId, body.moduleId);

    let query = supabase
      .from('exercises')
      .select('id,title,slug,drive_url,media_url,media_type,module_id')
      .not('drive_url', 'is', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(limit * 8);

    if (body.exerciseId) query = query.eq('id', body.exerciseId).limit(1);
    else if (scope.moduleIds.length) query = query.in('module_id', scope.moduleIds);
    else if (body.productId) return NextResponse.json({ total: 0, results: [], message: 'product_has_no_linked_modules' });

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const candidates = (data || []) as ExerciseRow[];
    const exercises = (body.force ? candidates : candidates.filter((exercise) => !isRealR2Url(exercise.media_url))).slice(0, limit);
    const access = await loadAccess();
    const results = [];

    for (const exercise of exercises) {
      const module = scope.modules.get(String(exercise.module_id || '')) || null;
      results.push(await migrateExercise(exercise, access, scope.product, module));
    }

    return NextResponse.json({ total: exercises.length, product: scope.product, r2Base: publicR2Base(), results });
  } catch (error) {
    return NextResponse.json({ error: 'drive_to_r2_migration_failed', message: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 });
  }
}
