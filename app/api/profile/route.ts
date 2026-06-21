import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'profile-avatars';

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
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

  const { data: created } = await supabase
    .from('profiles')
    .insert({ email, name: email.split('@')[0], role: 'student' })
    .select('*')
    .single();

  return created || null;
}

export async function POST(request: Request) {
  const profile = await currentProfile();
  if (!profile?.id) return NextResponse.redirect(new URL('/aluno/perfil?erro=perfil', request.url));

  const form = await request.formData();
  const name = String(form.get('name') || '').trim().slice(0, 80);
  const bio = String(form.get('bio') || '').trim().slice(0, 260);
  const headline = String(form.get('headline') || '').trim().slice(0, 120);
  const whatsapp = String(form.get('whatsapp') || '').trim().slice(0, 40);
  const avatar = form.get('avatar');

  const supabase = createAdminClient();
  let avatarUrl = String(profile.avatar_url || '');

  if (avatar instanceof File && avatar.size > 0) {
    const ok = await ensureBucket();
    if (!ok) return NextResponse.redirect(new URL('/aluno/perfil?erro=avatar', request.url));

    const contentType = avatar.type || 'image/jpeg';
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const objectPath = `${profile.id}/${Date.now()}-${safeName(avatar.name || 'avatar')}.${extension}`;
    const bytes = await avatar.arrayBuffer();
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, { contentType, upsert: true });
    if (uploadError) return NextResponse.redirect(new URL('/aluno/perfil?erro=upload', request.url));

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    avatarUrl = data.publicUrl;
  }

  const payload: Record<string, string> = {};
  if (name) payload.name = name;
  payload.bio = bio;
  payload.headline = headline;
  payload.whatsapp = whatsapp;
  if (avatarUrl) payload.avatar_url = avatarUrl;

  const { error } = await supabase.from('profiles').update(payload).eq('id', profile.id);
  if (error) return NextResponse.redirect(new URL(`/aluno/perfil?erro=${encodeURIComponent(error.message)}`, request.url));

  return NextResponse.redirect(new URL('/aluno/perfil?sucesso=perfil', request.url));
}
