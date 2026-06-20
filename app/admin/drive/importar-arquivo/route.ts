import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { driveFileLink, mediaTypeFromFile, slugify } from '@/lib/google/drive-utils';

export async function POST(request: Request) {
  const formData = await request.formData();
  const moduleId = String(formData.get('module_id') || '');
  const fileId = String(formData.get('file_id') || '');
  const name = String(formData.get('name') || '').trim();
  const mimeType = String(formData.get('mime_type') || '');
  const webViewLink = String(formData.get('web_view_link') || '').trim();

  if (!moduleId || !fileId || !name) {
    return NextResponse.redirect(new URL('/admin/biblioteca?erro=arquivo', request.url));
  }

  const cleanTitle = name.replace(/\.[^/.]+$/, '');
  const driveUrl = webViewLink || driveFileLink(fileId);
  const supabase = createAdminClient();

  const { data: existing } = await supabase.from('exercises').select('id').eq('drive_url', driveUrl).maybeSingle();
  if (!existing?.id) {
    const { count } = await supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('module_id', moduleId);
    await supabase.from('exercises').insert({
      module_id: moduleId,
      title: cleanTitle,
      slug: `${slugify(cleanTitle)}-${fileId.slice(0, 6)}`,
      description: 'Material importado do Google Drive.',
      objective: 'Assista, pratique e envie sua resposta para avaliacao.',
      media_type: mediaTypeFromFile(name, mimeType),
      difficulty: 1,
      drive_url: driveUrl,
      media_url: driveUrl,
      is_active: true,
      sort_order: (count || 0) + 1,
    });
  }

  return NextResponse.redirect(new URL(`/admin/biblioteca/${moduleId}?sucesso=arquivo`, request.url));
}
