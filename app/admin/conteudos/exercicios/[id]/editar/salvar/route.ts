import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/google/drive-utils';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  const supabase = createAdminClient();

  const title = String(formData.get('title') || '').trim();
  const module_id = String(formData.get('module_id') || '');
  const media_type = String(formData.get('media_type') || 'video');
  const difficulty = Number(formData.get('difficulty') || 1);
  const drive_url = String(formData.get('drive_url') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const objective = String(formData.get('objective') || '').trim();
  const trim_start_seconds = Math.max(0, Math.floor(Number(formData.get('trim_start_seconds') || 0)));
  const trim_end_seconds = Math.max(0, Math.floor(Number(formData.get('trim_end_seconds') || 0)));
  const editUrl = `/admin/conteudos/exercicios/${id}/editar`;

  if (!title || !module_id) {
    return NextResponse.redirect(new URL(`${editUrl}?erro=dados`, request.url));
  }

  const { error: baseError } = await supabase.from('exercises').update({
    title,
    slug: `${slugify(title)}-${id.slice(0, 6)}`,
    module_id,
    media_type,
    difficulty,
    drive_url,
    media_url: drive_url,
    description,
    objective,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  if (baseError) {
    console.error('Erro ao salvar dados do exercício', baseError.message);
    return NextResponse.redirect(new URL(`${editUrl}?erro=salvar`, request.url));
  }

  const { error: trimError } = await supabase
    .from('exercises')
    .update({ trim_start_seconds, trim_end_seconds })
    .eq('id', id);

  if (trimError) {
    console.error('Erro ao salvar corte do exercício', trimError.message);
    return NextResponse.redirect(new URL(`${editUrl}?erro=corte`, request.url));
  }

  return NextResponse.redirect(new URL(`${editUrl}?sucesso=salvo`, request.url));
}
