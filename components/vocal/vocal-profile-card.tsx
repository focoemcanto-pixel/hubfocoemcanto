import Link from 'next/link';
import { Pencil, Sparkles } from 'lucide-react';
import { formatBrazilianNote } from '@/lib/audio/pitch';

type VocalProfile = { classification?: string | null; classification_confidence?: number | null; lowest_note?: string | null; highest_note?: string | null; tessitura_low_note?: string | null; tessitura_high_note?: string | null; updated_at?: string | null } | null;

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function VocalProfileCard({ vocalProfile }: { vocalProfile: VocalProfile }) {
  const hasResult = Boolean(vocalProfile?.lowest_note && vocalProfile?.highest_note);
  return (
    <section className="vocal-profile-card vocal-profile-card--compact">
      <div className="vocal-profile-card__glow" />
      <header>
        <div><p>Perfil Vocal</p><h2>{hasResult ? 'Mapa vocal' : 'Crie seu Mapa Vocal'}</h2></div>
        <Link className="vocal-profile-card__edit" href="/aluno/perfil-vocal" aria-label={hasResult ? 'Refazer mapa vocal' : 'Fazer avaliação vocal'}>{hasResult ? <Pencil size={16} /> : <Sparkles size={16} />}</Link>
      </header>
      {hasResult ? <>
        <div className="vocal-profile-card__summary">
          <strong>{vocalProfile?.classification || 'Indefinida'}</strong>
          <span>{formatBrazilianNote(vocalProfile?.lowest_note)} → {formatBrazilianNote(vocalProfile?.highest_note)}</span>
          <span>Tessitura: {formatBrazilianNote(vocalProfile?.tessitura_low_note)} → {formatBrazilianNote(vocalProfile?.tessitura_high_note)}</span>
        </div>
        <small className="vocal-profile-card__date">Atualizado em {formatDate(vocalProfile?.updated_at)}</small>
      </> : <>
        <p>Descubra sua extensão e tessitura confortável.</p>
        <Link href="/aluno/perfil-vocal"><Sparkles size={18} /> Fazer avaliação vocal</Link>
      </>}
    </section>
  );
}
