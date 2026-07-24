import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const APP_ORIGIN = 'https://escola.focoemcanto.com';

type Body = { fileName?: string; mimeType?: string; sizeBytes?: number; theme?: string; dateLabel?: string; destinationFolderId?: string };

async function accessToken() {
  const supabase = createAdminClient();
  const { data } = await supabase.from('google_drive_connections').select('*').eq('id', 'default').maybeSingle();
  if (!data?.refresh_token) throw new Error('Google Drive não conectado');
  if (data.access_token && data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.access_token as string;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: data.refresh_token, grant_type: 'refresh_token' }),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Não foi possível renovar o acesso ao Google Drive (${response.status}${details ? `: ${details.slice(0,180)}` : ''})`);
  }
  const token = await response.json();
  await supabase.from('google_drive_connections').update({ access_token: token.access_token, expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('id', 'default');
  return token.access_token as string;
}

async function findOrCreateFolder(token: string, name: string, parent?: string) {
  const escaped = name.replace(/'/g, "\\'");
  const parentQuery = parent ? ` and '${parent}' in parents` : " and 'root' in parents";
  const query = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escaped}'${parentQuery}`;
  const found = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`, { headers: { authorization: `Bearer ${token}` } });
  if (found.ok) {
    const json = await found.json();
    if (json.files?.[0]?.id) return json.files[0].id as string;
  }
  const created = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }) });
  if (!created.ok) {
    const details = await created.text().catch(() => '');
    throw new Error(`Não foi possível criar a pasta no Google Drive (${created.status}${details ? `: ${details.slice(0,180)}` : ''})`);
  }
  return (await created.json()).id as string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Body;
    if (!body.fileName || !body.mimeType) return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });
    const token = await accessToken();
    const now = new Date();
    const year = String(now.getFullYear());
    const month = now.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^./, c => c.toUpperCase());
    const selectedRoot = body.destinationFolderId && body.destinationFolderId !== 'root' ? body.destinationFolderId : undefined;
    const root = await findOrCreateFolder(token, 'Foco Live — Gravações', selectedRoot);
    const yearFolder = await findOrCreateFolder(token, year, root);
    const monthFolder = await findOrCreateFolder(token, month, yearFolder);
    const lessonFolder = await findOrCreateFolder(token, `${body.theme || 'Aula'} — ${body.dateLabel || now.toLocaleDateString('pt-BR').replaceAll('/', '-')}`, monthFolder);

    const headers: Record<string,string> = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': body.mimeType,
      origin: APP_ORIGIN,
    };
    if (body.sizeBytes && body.sizeBytes > 0) headers['x-upload-content-length'] = String(body.sizeBytes);

    const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: body.fileName, mimeType: body.mimeType, parents: [lessonFolder] }),
    });
    if (!init.ok) {
      const details = await init.text().catch(() => '');
      throw new Error(`Não foi possível iniciar o envio ao Google Drive (${init.status}${details ? `: ${details.slice(0,220)}` : ''})`);
    }
    const uploadUrl = init.headers.get('location');
    if (!uploadUrl) throw new Error('O Google Drive não retornou uma sessão de upload');
    return NextResponse.json({ uploadUrl, folderId: lessonFolder });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao preparar o Google Drive' }, { status: 500 });
  }
}
