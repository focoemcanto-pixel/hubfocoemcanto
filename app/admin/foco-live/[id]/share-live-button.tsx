'use client';

import { useMemo, useState } from 'react';

type Props = {
  title: string;
  description?: string | null;
  slug: string;
  startsAt?: string | null;
};

function calendarStamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export default function ShareLiveButton({ title, description, slug, startsAt }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const data = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const publicUrl = `${window.location.origin}/live/${slug}`;
    const start = startsAt ? new Date(startsAt) : null;
    const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
    const end = validStart ? new Date(validStart.getTime() + 90 * 60 * 1000) : null;
    const details = `${description || 'Transmissão ao vivo do Foco em Canto.'}\n\nAcesse a live: ${publicUrl}`;
    const message = `Você está convidado para ${title}!${validStart ? `\n📅 ${validStart.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}` : ''}\n🎥 Acesse: ${publicUrl}`;
    return { publicUrl, validStart, end, details, message };
  }, [description, slug, startsAt, title, open]);

  async function copyLink() {
    if (!data) return;
    await navigator.clipboard.writeText(data.publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  async function nativeShare() {
    if (!data) return;
    if (navigator.share) {
      await navigator.share({ title, text: data.message, url: data.publicUrl });
      return;
    }
    await copyLink();
  }

  function downloadIcs() {
    if (!data?.validStart || !data.end) return;
    const now = calendarStamp(new Date());
    const uid = `foco-live-${slug}-${data.validStart.getTime()}@focoemcanto.com`;
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Foco em Canto//Foco Live//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${calendarStamp(data.validStart)}`,
      `DTEND:${calendarStamp(data.end)}`,
      `SUMMARY:${escapeIcs(title)}`,
      `DESCRIPTION:${escapeIcs(data.details)}`,
      `LOCATION:${escapeIcs(data.publicUrl)}`,
      `URL:${data.publicUrl}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:Live amanhã',
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Live em 1 hora',
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Live em 15 minutos',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const googleUrl = data?.validStart && data.end
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${calendarStamp(data.validStart)}/${calendarStamp(data.end)}&details=${encodeURIComponent(data.details)}&location=${encodeURIComponent(data.publicUrl)}`
    : '';
  const outlookUrl = data?.validStart && data.end
    ? `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(data.validStart.toISOString())}&enddt=${encodeURIComponent(data.end.toISOString())}&body=${encodeURIComponent(data.details)}&location=${encodeURIComponent(data.publicUrl)}`
    : '';

  return (
    <>
      <button type="button" className="foco-live-secondary fl-share-trigger" onClick={() => setOpen(true)}>Compartilhar link</button>
      {open && data && (
        <div className="fl-share-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="fl-share-modal" role="dialog" aria-modal="true" aria-label="Compartilhar live">
            <button className="fl-share-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
            <span className="foco-live-kicker">Convidar participantes</span>
            <h2>Compartilhar e agendar</h2>
            <p>Envie o link público e ajude os convidados a salvarem a transmissão na agenda.</p>

            <div className="fl-share-link-row">
              <input readOnly value={data.publicUrl} aria-label="Link público da live" />
              <button type="button" onClick={copyLink}>{copied ? 'Copiado ✓' : 'Copiar'}</button>
            </div>

            <div className="fl-share-actions">
              <a href={`https://wa.me/?text=${encodeURIComponent(data.message)}`} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a>
              <button type="button" onClick={nativeShare}>Mais opções</button>
            </div>

            <div className="fl-calendar-block">
              <div><strong>Adicionar à agenda</strong><small>{data.validStart ? data.validStart.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' }) : 'Defina data e horário para liberar o agendamento.'}</small></div>
              <div className="fl-calendar-actions">
                {data.validStart ? <>
                  <a href={googleUrl} target="_blank" rel="noreferrer">Google Agenda</a>
                  <a href={outlookUrl} target="_blank" rel="noreferrer">Outlook</a>
                  <button type="button" onClick={downloadIcs}>Apple / arquivo .ics</button>
                </> : <button type="button" disabled>Agendamento indisponível</button>}
              </div>
              {data.validStart && <small className="fl-reminder-note">O arquivo de calendário inclui lembretes 1 dia, 1 hora e 15 minutos antes.</small>}
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .fl-share-trigger{font:inherit;cursor:pointer}
        .fl-share-backdrop{position:fixed;z-index:9999;inset:0;display:grid;place-items:center;padding:20px;background:rgba(5,3,9,.78);backdrop-filter:blur(14px)}
        .fl-share-modal{position:relative;width:min(620px,100%);padding:30px;border:1px solid rgba(190,126,255,.22);border-radius:26px;background:radial-gradient(circle at 100% 0%,rgba(137,53,231,.16),transparent 34%),linear-gradient(145deg,#191020,#0c0911);box-shadow:0 35px 110px rgba(0,0,0,.6);color:#fff}
        .fl-share-modal h2{margin:8px 0 8px;font-size:32px}.fl-share-modal>p{margin:0 0 22px;color:#aaa0b2;line-height:1.55}
        .fl-share-close{position:absolute;right:18px;top:18px;width:38px;height:38px;border:0;border-radius:12px;background:rgba(255,255,255,.07);color:#fff;font-size:24px;cursor:pointer}
        .fl-share-link-row{display:grid;grid-template-columns:1fr auto;gap:10px}.fl-share-link-row input{min-width:0;height:50px;padding:0 14px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#100b16;color:#ddd;font:inherit}.fl-share-link-row button,.fl-share-actions button,.fl-share-actions a,.fl-calendar-actions button,.fl-calendar-actions a{display:flex;align-items:center;justify-content:center;min-height:46px;padding:0 17px;border:1px solid rgba(255,255,255,.11);border-radius:13px;background:rgba(255,255,255,.06);color:#fff;text-decoration:none;font:inherit;font-weight:800;cursor:pointer}
        .fl-share-link-row button{border:0;background:linear-gradient(135deg,#a54fff,#6e27db)}
        .fl-share-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.fl-share-actions a{background:rgba(42,179,85,.16);border-color:rgba(63,210,105,.25)}
        .fl-calendar-block{margin-top:22px;padding:18px;border:1px solid rgba(228,183,96,.18);border-radius:18px;background:rgba(229,177,79,.055)}.fl-calendar-block>div:first-child strong,.fl-calendar-block>div:first-child small{display:block}.fl-calendar-block>div:first-child small{margin-top:5px;color:#aaa0b2}
        .fl-calendar-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:15px}.fl-calendar-actions a,.fl-calendar-actions button{min-height:42px;padding:7px 10px;font-size:12px}.fl-calendar-actions button:disabled{opacity:.5;cursor:not-allowed;grid-column:1/-1}.fl-reminder-note{display:block;margin-top:12px;color:#978d9e;font-size:11px}
        @media(max-width:620px){.fl-share-modal{padding:24px 18px}.fl-share-link-row{grid-template-columns:1fr}.fl-share-actions,.fl-calendar-actions{grid-template-columns:1fr}.fl-share-modal h2{font-size:27px}}
      `}</style>
    </>
  );
}
