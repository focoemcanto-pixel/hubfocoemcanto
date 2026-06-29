import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'profile-avatars';
const SUBMISSION_BUCKET = 'submission-media';

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function wantsJson(request: Request) {
  return request.headers.get('accept')?.includes('application/json') || request.headers.get('x-requested-with') === 'fetch';
}

function reply(request: Request, payload: Record<string, unknown>, status = 200) {
  if (wantsJson(request)) return NextResponse.json(payload, { status });
  if (payload.ok) return NextResponse.redirect(new URL('/aluno/perfil?sucesso=perfil', request.url), { status: 303 });
  return NextResponse.redirect(new URL(`/aluno/perfil?erro=${encodeURIComponent(String(payload.error || 'perfil'))}`, request.url), { status: 303 });
}

function missingColumn(message?: string) {
  return !!message && (message.includes('schema cache') || message.includes('column') || message.includes('Could not find'));
}

function storagePathFromPublicUrl(url: string, bucket: string) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return '';
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
}

async function ensureBucket() {
  const supabase = createAdminClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.id === BUCKET || bucket.name === BUCKET);
  if (exists) return true;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  return !error;
}

async function currentProfile() {
  const email = (await cookies()).get('hub_access_email')?.value;
  if (!email) return null;
  const supabase = createAdminClient();
  const { data } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from('profiles').insert({ email, name: email.split('@')[0], role: 'student' }).select('*').single();
  return created || null;
}

async function deleteWhere(supabase: ReturnType<typeof createAdminClient>, table: string, column: string, value: string) {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) console.warn(`delete_${table}_${column}`, error.message);
}

async function deleteIn(supabase: ReturnType<typeof createAdminClient>, table: string, column: string, values: string[]) {
  if (!values.length) return;
  const { error } = await supabase.from(table).delete().in(column, values);
  if (error) console.warn(`delete_${table}_${column}_in`, error.message);
}

async function deleteUserStorage(supabase: ReturnType<typeof createAdminClient>, profile: any) {
  const profileId = String(profile.id || '');
  const email = String(profile.email || '');
  const avatarUrl = String(profile.avatar_url || '');
  const avatarPath = storagePathFromPublicUrl(avatarUrl, BUCKET);

  if (profileId) {
    const { data } = await supabase.storage.from(BUCKET).list(profileId, { limit: 100 });
    const paths = (data || []).map((item) => `${profileId}/${item.name}`);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => null);
  }
  if (avatarPath) await supabase.storage.from(BUCKET).remove([avatarPath]).catch(() => null);

  if (email) {
    const folder = safeName(email);
    const { data } = await supabase.storage.from(SUBMISSION_BUCKET).list(folder, { limit: 100 });
    const paths = (data || []).map((item) => `${folder}/${item.name}`);
    if (paths.length) await supabase.storage.from(SUBMISSION_BUCKET).remove(paths).catch(() => null);
  }
}

async function deleteAuthUserIfPossible(supabase: ReturnType<typeof createAdminClient>, profile: any) {
  const profileId = String(profile.id || '');
  if (profileId) {
    const { error } = await supabase.auth.admin.deleteUser(profileId);
    if (!error) return;
  }

  const email = String(profile.email || '').toLowerCase();
  if (!email) return;
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data?.users?.find((item) => item.email?.toLowerCase() === email);
  if (user?.id) await supabase.auth.admin.deleteUser(user.id).catch(() => null);
}

export async function POST(request: Request) {
  const profile = await currentProfile();
  if (!profile?.id) return reply(request, { ok: false, error: 'perfil' }, 401);

  const form = await request.formData();
  const name = String(form.get('name') || '').trim().slice(0, 80);
  const bio = String(form.get('bio') || '').trim().slice(0, 260);
  const headline = String(form.get('headline') || '').trim().slice(0, 120);
  const whatsapp = String(form.get('whatsapp') || '').trim().slice(0, 40);
  const avatar = form.get('avatar');

  const supabase = createAdminClient();
  let avatarUrl = String((profile as any).avatar_url || '');

  if (avatar instanceof File && avatar.size > 0) {
    const ok = await ensureBucket();
    if (!ok) return reply(request, { ok: false, error: 'avatar' }, 500);
    const contentType = avatar.type || 'image/jpeg';
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const objectPath = `${profile.id}/${Date.now()}-${safeName(avatar.name || 'avatar')}.${extension}`;
    const bytes = await avatar.arrayBuffer();
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, { contentType, upsert: true });
    if (uploadError) return reply(request, { ok: false, error: uploadError.message }, 500);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    avatarUrl = data.publicUrl;
  }

  const payload: Record<string, string> = { bio, headline, whatsapp, updated_at: new Date().toISOString() };
  if (name) payload.name = name;
  if (avatarUrl) payload.avatar_url = avatarUrl;

  const { data: updated, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', profile.id)
    .select('id,name,bio,headline,whatsapp,avatar_url')
    .maybeSingle();

  if (!error && updated) return reply(request, { ok: true, ...updated });

  if (missingColumn(error?.message)) {
    const safePayload: Record<string, string> = { updated_at: new Date().toISOString() };
    if (name) safePayload.name = name;
    if (avatarUrl) safePayload.avatar_url = avatarUrl;
    await supabase.from('profiles').update(safePayload).eq('id', profile.id);
    return reply(
      request,
      {
        ok: false,
        error: 'schema_perfil_incompleto',
        detail: 'A tabela profiles ainda não possui as colunas bio/headline/whatsapp no banco de produção. Rode o SQL de perfil para ativar o salvamento completo.',
      },
      500
    );
  }

  return reply(request, { ok: false, error: error?.message || 'perfil_nao_salvo' }, 500);
}

export async function DELETE(request: Request) {
  const profile = await currentProfile();
  if (!profile?.id) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const confirmation = String(body?.confirmation || '').trim().toUpperCase();
  if (confirmation !== 'EXCLUIR') {
    return NextResponse.json({ ok: false, error: 'confirmation_required', detail: 'Digite EXCLUIR para confirmar.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const profileId = String(profile.id);

  const { data: posts } = await supabase.from('community_posts').select('id').eq('profile_id', profileId);
  const postIds = (posts || []).map((post: any) => String(post.id)).filter(Boolean);

  if (postIds.length) {
    await deleteIn(supabase, 'community_comments', 'post_id', postIds);
    await deleteIn(supabase, 'community_likes', 'post_id', postIds);
    await deleteIn(supabase, 'community_saves', 'post_id', postIds);
    await deleteIn(supabase, 'community_reposts', 'post_id', postIds);
  }

  await Promise.all([
    deleteWhere(supabase, 'community_comments', 'profile_id', profileId),
    deleteWhere(supabase, 'community_likes', 'profile_id', profileId),
    deleteWhere(supabase, 'community_saves', 'profile_id', profileId),
    deleteWhere(supabase, 'community_reposts', 'profile_id', profileId),
    deleteWhere(supabase, 'community_follows', 'follower_id', profileId),
    deleteWhere(supabase, 'community_follows', 'following_id', profileId),
    deleteWhere(supabase, 'submissions', 'profile_id', profileId),
    deleteWhere(supabase, 'subscriptions', 'profile_id', profileId),
    deleteWhere(supabase, 'lesson_progress', 'profile_id', profileId),
    deleteWhere(supabase, 'vocal_profiles', 'profile_id', profileId),
    deleteWhere(supabase, 'repertoire_studies', 'profile_id', profileId),
  ]);

  if (postIds.length) await deleteIn(supabase, 'community_posts', 'id', postIds);
  await deleteUserStorage(supabase, profile);
  await supabase.from('profiles').delete().eq('id', profileId);
  await deleteAuthUserIfPossible(supabase, profile).catch(() => null);

  const response = NextResponse.json({ ok: true, redirect: '/login?conta=excluida' });
  response.cookies.set('hub_access_email', '', { path: '/', maxAge: 0 });
  return response;
}
