'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Sparkles } from 'lucide-react';
import { formatBrazilianNote } from '@/lib/audio/pitch';

type VocalProfile = { classification?: string | null; classification_confidence?: number | null; lowest_note?: string | null; highest_note?: string | null; tessitura_low_note?: string | null; tessitura_high_note?: string | null; updated_at?: string | null } | null;

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function newerProfile(current: VocalProfile, next: VocalProfile) {
  if (!next?.lowest_note || !next?.highest_note) return current;
  if (!current?.updated_at) return next;
  const currentTime = new Date(current.updated_at).getTime();
  const nextTime = new Date(next.updated_at || '').getTime();
  return !Number.isNaN(nextTime) && nextTime >= currentTime ? next : current;
}

function CompactMap({ vocalProfile }: { vocalProfile: NonNullable<VocalProfile> }) {
  return <>
    <div className="vocal-profile-card__summary">
      <strong>{vocalProfile.classification || 'Indefinida'}</strong>
      <span>Extensão: {formatBrazilianNote(vocalProfile.lowest_note)} → {formatBrazilianNote(vocalProfile.highest_note)}</span>
      <span>Tessitura: {formatBrazilianNote(vocalProfile.tessitura_low_note)} → {formatBrazilianNote(vocalProfile.tessitura_high_note)}</span>
    </div>
    <small className="vocal-profile-card__date">Atualizado em {formatDate(vocalProfile.updated_at)}</small>
  </>;
}

export function VocalProfileCard({ vocalProfile }: { vocalProfile: VocalProfile }) {
  const [currentProfile, setCurrentProfile] = useState<VocalProfile>(vocalProfile || null);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/vocal-profile/current?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.vocalProfile?.lowest_note && json?.vocalProfile?.highest_note) {
        setCurrentProfile((old) => newerProfile(old, json.vocalProfile));
      }
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;
    let attempts = 0;
    const tick = async () => {
      if (!active) return;
      attempts += 1;
      await refreshProfile();
      if (attempts >= 12) window.clearInterval(interval);
    };
    void tick();
    const interval = window.setInterval(tick, 650);
    const onFocus = () => void refreshProfile();
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshProfile(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshProfile]);

  const hasResult = Boolean(currentProfile?.lowest_note && currentProfile?.highest_note);

  return (
    <section className="vocal-profile-card vocal-profile-card--compact">
      <div className="vocal-profile-card__glow" />
      <header>
        <div><p>Perfil Vocal</p><h2>{hasResult ? 'Mapa vocal' : 'Crie seu Mapa Vocal'}</h2></div>
        <Link className="vocal-profile-card__edit" href="/aluno/perfil-vocal" aria-label={hasResult ? 'Refazer mapa vocal' : 'Fazer avaliação vocal'}>{hasResult ? <Pencil size={16} /> : <Sparkles size={16} />}</Link>
      </header>
      {hasResult && currentProfile ? <CompactMap vocalProfile={currentProfile} /> : <>
        <p>Descubra sua extensão e tessitura confortável.</p>
        <Link href="/aluno/perfil-vocal"><Sparkles size={18} /> Fazer avaliação vocal</Link>
      </>}
    </section>
  );
}
