import Link from 'next/link';
import { Mic2, RefreshCw, Sparkles } from 'lucide-react';

type VocalProfile = { classification?: string | null; classification_confidence?: number | null; lowest_note?: string | null; highest_note?: string | null; tessitura_low_note?: string | null; tessitura_high_note?: string | null; updated_at?: string | null } | null;

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function VocalProfileCard({ vocalProfile }: { vocalProfile: VocalProfile }) {
  const hasResult = Boolean(vocalProfile?.lowest_note && vocalProfile?.highest_note);
  return (
    <section className="vocal-profile-card">
      <div className="vocal-profile-card__glow" />
      <header>
        <span><Mic2 size={22} /></span>
        <div><p>Perfil Vocal</p><h2>{hasResult ? 'Seu Mapa Vocal' : 'Crie seu Mapa Vocal'}</h2></div>
      </header>
      {hasResult ? <>
        <div className="vocal-profile-card__grid">
          <article><small>Tendência vocal</small><strong>{vocalProfile?.classification || 'Indefinida'}</strong></article>
          <article><small>Extensão</small><strong>{vocalProfile?.lowest_note} → {vocalProfile?.highest_note}</strong></article>
          <article><small>Tessitura</small><strong>{vocalProfile?.tessitura_low_note || '—'} → {vocalProfile?.tessitura_high_note || '—'}</strong></article>
          <article><small>Atualizado</small><strong>{formatDate(vocalProfile?.updated_at)}</strong></article>
        </div>
        <p>Classificação aproximada: leitura inicial para orientar seus estudos, não uma sentença definitiva.</p>
        <Link href="/aluno/perfil-vocal"><RefreshCw size={18} /> Refazer avaliação</Link>
      </> : <>
        <p>Descubra sua extensão, tessitura confortável e tendência vocal com uma avaliação guiada pelo microfone.</p>
        <Link href="/aluno/perfil-vocal"><Sparkles size={18} /> Fazer avaliação vocal</Link>
      </>}
    </section>
  );
}
