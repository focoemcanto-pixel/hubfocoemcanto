import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'profile-avatars';

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
