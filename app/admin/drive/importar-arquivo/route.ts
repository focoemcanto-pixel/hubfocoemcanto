import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { driveFileLink, mediaTypeFromFile, slugify } from '@/lib/google/drive-utils';

function hubMediaUrl(fileId: string) {
  return `/api/media/drive/${fileId}`;
}

export async function POST(request: Request) {
  try {
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

    const { data: existing } = await supabase
      .from('exercises')
      .select('id')
      .eq('module_id', moduleId)
      .eq('drive_url', driveUrl)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.redirect(new URL(`/admin/biblioteca/${moduleId}?aviso=ja-importado`, request.url));
    }

    const { count } = await supabase
      .from('exercises')
      .select('*', { count: 'exact', head: true })
      .eq('module_id', moduleId);

    const { error } = await supabase.from('exercises').insert({
      module_id: moduleId,
      title: cleanTitle,
      slug: `${slugify(cleanTitle)}-${fileId.slice(0, 6)}-${Date.now().toString(36)}`,
      description: '',
      objective: 'Assista, pratique e envie sua resposta para avaliacao.',
      media_type: mediaTypeFromFile(name, mimeType),
      difficulty: 1,
      drive_url: driveUrl,
      media_url: hubMediaUrl(fileId),
      is_active: true,
      sort_order: (count || 0) + 1,
    });

    if (error) {
      return NextResponse.redirect(new URL(`/admin/biblioteca/${moduleId}?erro=${encodeURIComponent(error.message)}`, request.url));
    }

    return NextResponse.redirect(new URL(`/admin/biblioteca/${moduleId}?sucesso=arquivo`, request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erro-importacao';
    return NextResponse.redirect(new URL(`/admin/biblioteca?erro=${encodeURIComponent(message)}`, request.url));
  }
}
