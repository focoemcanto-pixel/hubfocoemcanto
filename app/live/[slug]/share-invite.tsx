'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, Check, Copy, MessageCircle, Share2, X } from 'lucide-react';
import './share-invite.css';

type Props = {
  slug: string;
  title: string;
  description?: string | null;
  startsAt?: string | null;
};

function formatSchedule(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Bahia',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Bahia',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date),
  };
}

export default function ShareInvite({ slug, title, description, startsAt }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const schedule = useMemo(() => formatSchedule(startsAt), [startsAt]);

  const origin = typeof window === 'undefined' ? 'https://escola.focoemcanto.com' : window.location.origin;
  const liveUrl = `${origin}/live/${encodeURIComponent(slug)}`;
  const scheduleUrl = `${origin}/live/${encodeURIComponent(slug)}/agendar`;
  const invitation = [
    `🎙️ *${title}*`,
    schedule ? `📅 ${schedule.date}` : null,
    schedule ? `🕒 ${schedule.time} (horário de Salvador)` : null,
    description ? `\n${description}` : null,
    `\n🔗 Acessar a transmissão:\n${liveUrl}`,
    startsAt ? `\n📆 Adicionar à agenda e ativar lembrete:\n${scheduleUrl}` : null,
  ].filter(Boolean).join('\n');

  useEffect(() => {
    const handleShareClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('.fl-share-live-button');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpen(true);
    };
    document.addEventListener('click', handleShareClick, true);
    return () => document.removeEventListener('click', handleShareClick, true);
  }, []);

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(invitation);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = invitation;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function nativeShare() {
    if (!navigator.share) return copyInvitation();
    try {
      await navigator.share({ title, text: invitation, url: scheduleUrl });
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') await copyInvitation();
    }
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fl-invite-overlay" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="fl-invite-modal" role="dialog" aria-modal="true" aria-label="Compartilhar convite da transmissão">
        <button className="fl-invite-close" onClick={() => setOpen(false)} aria-label="Fechar"><X size={20} /></button>
        <span className="fl-invite-kicker">CONVITE DA TRANSMISSÃO</span>
        <h2>Compartilhar com os alunos</h2>
        <p>O aluno receberá os detalhes da live, o link de acesso e a opção de adicionar o evento à própria agenda.</p>

        <div className="fl-invite-preview">
          <strong>{title}</strong>
          {schedule && <><span>📅 {schedule.date}</span><span>🕒 {schedule.time} — horário de Salvador</span></>}
          {description && <small>{description}</small>}
        </div>

        <div className="fl-invite-actions">
          <a className="whatsapp" href={`https://wa.me/?text=${encodeURIComponent(invitation)}`} target="_blank" rel="noreferrer">
            <MessageCircle size={19} /> Enviar pelo WhatsApp
          </a>
          <button onClick={copyInvitation}>{copied ? <Check size={19} /> : <Copy size={19} />}{copied ? 'Convite copiado!' : 'Copiar convite'}</button>
          {startsAt && <a href={scheduleUrl} target="_blank" rel="noreferrer"><CalendarPlus size={19} /> Ver página de agendamento</a>}
          <button className="secondary" onClick={nativeShare}><Share2 size={19} /> Mais opções</button>
        </div>

        <small className="fl-invite-note">O link compartilhado nunca inclui <b>?host=1</b>. O agendamento será feito pelo próprio aluno.</small>
      </section>
    </div>,
    document.body,
  );
}
