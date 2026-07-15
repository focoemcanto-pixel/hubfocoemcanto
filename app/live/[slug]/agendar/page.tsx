import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarPlus, ExternalLink, Video } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import './agenda.css';

type Props = { params: Promise<{ slug: string }> };

function formatGoogleDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function getEnd(start: Date) {
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

function absoluteUrl(path: string) {
  return `https://escola.focoemcanto.com${path}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data: live } = await createAdminClient()
    .from('live_sessions')
    .select('title,description,offer_config')
    .eq('slug', slug)
    .maybeSingle();

  if (!live) return { title: 'Foco Live' };
  const image = live.offer_config?.share_image_url as string | undefined;
  const title = `${live.title} — adicione à agenda`;
  const description = live.description || 'Confirme sua participação e adicione esta transmissão à sua agenda.';
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/live/${slug}/agendar`,
      images: image ? [{ url: image, width: 1200, height: 630, alt: live.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ScheduleLivePage({ params }: Props) {
  const { slug } = await params;
  const { data: live } = await createAdminClient()
    .from('live_sessions')
    .select('title,description,starts_at,status,offer_config')
    .eq('slug', slug)
    .maybeSingle();

  if (!live) notFound();

  const livePath = `/live/${encodeURIComponent(slug)}`;
  const liveUrl = absoluteUrl(livePath);
  const start = live.starts_at ? new Date(live.starts_at) : null;
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
  const end = validStart ? getEnd(validStart) : null;
  const details = `${live.description || 'Transmissão ao vivo do Foco em Canto.'}\n\nAcesse a transmissão: ${liveUrl}`;

  const googleUrl = validStart && end
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(live.title)}&dates=${formatGoogleDate(validStart)}/${formatGoogleDate(end)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(liveUrl)}`
    : null;
  const outlookUrl = validStart && end
    ? `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(live.title)}&startdt=${encodeURIComponent(validStart.toISOString())}&enddt=${encodeURIComponent(end.toISOString())}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(liveUrl)}`
    : null;
  const calendarFile = `/api/live/${encodeURIComponent(slug)}/calendar`;

  const dateText = validStart
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(validStart)
    : null;
  const timeText = validStart
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }).format(validStart)
    : null;

  return (
    <main className="fl-agenda-shell">
      <section className="fl-agenda-card">
        <div className="fl-agenda-brand"><span>F</span><div><b>FOCO LIVE</b><small>por Foco em Canto</small></div></div>
        <span className="fl-agenda-kicker">CONVITE PARA TRANSMISSÃO</span>
        <h1>{live.title}</h1>
        {live.description && <p>{live.description}</p>}

        <div className="fl-agenda-details">
          {dateText && <strong>📅 {dateText}</strong>}
          {timeText && <strong>🕒 {timeText} — horário de Salvador</strong>}
          {!validStart && <strong>O horário será confirmado pelo apresentador.</strong>}
        </div>

        {validStart && (
          <div className="fl-agenda-options">
            <h2>Adicionar à minha agenda</h2>
            <p>Escolha onde deseja salvar o compromisso. O lembrete ficará na agenda de quem clicar.</p>
            <div>
              {googleUrl && <a href={googleUrl} target="_blank" rel="noreferrer"><CalendarPlus size={19} /> Google Agenda <ExternalLink size={15} /></a>}
              {outlookUrl && <a href={outlookUrl} target="_blank" rel="noreferrer"><CalendarPlus size={19} /> Outlook <ExternalLink size={15} /></a>}
              <a href={calendarFile}><CalendarPlus size={19} /> Apple Calendar / arquivo .ics</a>
            </div>
          </div>
        )}

        <a className="fl-agenda-enter" href={livePath}><Video size={20} /> Entrar na transmissão</a>
        <small className="fl-agenda-note">Ao salvar, a agenda poderá aplicar os lembretes padrão configurados no seu dispositivo.</small>
      </section>
    </main>
  );
}
