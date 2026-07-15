import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Props = { params: Promise<{ slug: string }> };

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function formatIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params;
  const { data: live } = await createAdminClient()
    .from('live_sessions')
    .select('id,title,description,starts_at')
    .eq('slug', slug)
    .maybeSingle();

  if (!live || !live.starts_at) {
    return NextResponse.json({ error: 'Transmissão sem data definida.' }, { status: 404 });
  }

  const start = new Date(live.starts_at);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Data inválida.' }, { status: 400 });
  }
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const liveUrl = `https://escola.focoemcanto.com/live/${encodeURIComponent(slug)}`;
  const description = `${live.description || 'Transmissão ao vivo do Foco em Canto.'}\n\nAcesse: ${liveUrl}`;
  const now = new Date();

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Foco em Canto//Foco Live//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:foco-live-${live.id}@focoemcanto.com`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcs(live.title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(liveUrl)}`,
    `URL:${liveUrl}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Lembrete da Foco Live',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:A Foco Live começa em 1 hora',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:A Foco Live começa em 15 minutos',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="foco-live-${slug}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
