import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const supabase = createAdminClient();

  const title = String(formData.get('title') || '').trim();
  const module_id = String(formData.get('module_id') || '');
  const media_type = String(formData.get('media_type') || 'video');
  const difficulty = Number(formData.get('difficulty') || 1);
  const drive_url = String(formData.get('drive_url') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const objective = String(formData.get('objective') || '').trim();
  const slug = `${slugify(title)}-${Date.now().toString(36)}`;

  if (!title || !module_id) {
    return NextResponse.redirect(new URL('/admin/conteudos?erro=dados', request.url));
  }

  const { error } = await supabase.from('exercises').insert({
    module_id,
    title,
    slug,
    description,
    objective,
    media_type,
    difficulty,
    drive_url,
    media_url: drive_url,
    is_active: true,
  });

  if (error) {
    return NextResponse.redirect(new URL('/admin/conteudos?erro=salvar', request.url));
  }

  return NextResponse.redirect(new URL('/admin/conteudos?sucesso=exercicio', request.url));
}
