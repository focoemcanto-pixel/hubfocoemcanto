"use client";

import { useMemo, useState } from 'react';

type VocalProfile = {
  id?: string;
  profile_id?: string;
  auth_user_id?: string | null;
  lowest_note?: string | null;
  highest_note?: string | null;
  comfortable_low_note?: string | null;
  comfortable_high_note?: string | null;
  voice_type?: string | null;
  notes?: string | null;
};

type Props = {
  profileId: string;
  authUserId?: string | null;
  initialProfile?: VocalProfile | null;
};

const lowNotes = ['C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3'];
const highNotes = ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5'];
const voiceTypes = ['Baixo', 'Barítono', 'Tenor', 'Contralto', 'Mezzo-soprano', 'Soprano', 'Ainda não sei'];

const css = `
.vocal-range-page{min-height:100dvh;background:radial-gradient(circle at 20% 0%,rgba(245,199,107,.12),transparent 34%),#050507;color:#fff;padding:32px 20px 120px}.vocal-range-shell{max-width:980px;margin:0 auto}.vocal-range-back{display:inline-flex;color:#f5c76b;text-decoration:none;font-weight:900;margin-bottom:18px}.vocal-range-card{border:1px solid rgba(245,199,107,.22);border-radius:30px;background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.38);padding:28px}.vocal-range-kicker{text-transform:uppercase;letter-spacing:.24em;color:#f5c76b;font-size:12px;font-weight:950;margin:0 0 10px}.vocal-range-card h1{font-size:clamp(34px,6vw,64px);line-height:.95;margin:0 0 14px;letter-spacing:-.06em}.vocal-range-card p{color:rgba(255,255,255,.68);line-height:1.5;margin:0}.vocal-range-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:24px}.vocal-range-field{display:grid;gap:8px}.vocal-range-field.full{grid-column:1/-1}.vocal-range-field span{font-size:13px;color:rgba(255,255,255,.64);font-weight:800}.vocal-range-field select,.vocal-range-field textarea{width:100%;border:1px solid rgba(255,255,255,.13);background:rgba(0,0,0,.24);color:#fff;border-radius:16px;padding:14px 16px;outline:none}.vocal-range-field textarea{min-height:110px;resize:vertical}.vocal-range-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}.vocal-range-btn{border:0;border-radius:16px;background:linear-gradient(135deg,#ffe08a,#d4a43c);color:#120c05;font-weight:950;padding:14px 20px;cursor:pointer}.vocal-range-secondary{border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.06);color:#fff;font-weight:900;padding:14px 20px;text-decoration:none}.vocal-range-result{margin-top:18px;border:1px solid rgba(88,239,120,.22);background:rgba(88,239,120,.08);color:#bbf7d0;border-radius:16px;padding:14px}.vocal-range-error{margin-top:18px;border:1px solid rgba(248,113,113,.24);background:rgba(248,113,113,.1);color:#fecaca;border-radius:16px;padding:14px}@media(max-width:720px){.vocal-range-grid{grid-template-columns:1fr}.vocal-range-card{padding:22px}}
`;

function guessVoiceType(low: string, high: string) {
  const highIndex = highNotes.indexOf(high);
  const lowIndex = lowNotes.indexOf(low);
  if (highIndex >= highNotes.indexOf('C5') && lowIndex >= lowNotes.indexOf('C3')) return 'Soprano';
  if (highIndex >= highNotes.indexOf('A4') && lowIndex >= lowNotes.indexOf('A2')) return 'Tenor';
  if (lowIndex <= lowNotes.indexOf('G2') && highIndex <= highNotes.indexOf('E4')) return 'Barítono';
  if (lowIndex <= lowNotes.indexOf('E2')) return 'Baixo';
  return 'Ainda não sei';
}

export function VocalRangeTest({ profileId, authUserId, initialProfile }: Props) {
  const [lowestNote, setLowestNote] = useState(initialProfile?.lowest_note || 'C3');
  const [highestNote, setHighestNote] = useState(initialProfile?.highest_note || 'A4');
  const [comfortableLowNote, setComfortableLowNote] = useState(initialProfile?.comfortable_low_note || 'E3');
  const [comfortableHighNote, setComfortableHighNote] = useState(initialProfile?.comfortable_high_note || 'E4');
  const [voiceType, setVoiceType] = useState(initialProfile?.voice_type || 'Ainda não sei');
  const [notes, setNotes] = useState(initialProfile?.notes || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestion = useMemo(() => guessVoiceType(lowestNote, highestNote), [lowestNote, highestNote]);

  async function saveProfile() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/vocal-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          auth_user_id: authUserId,
          lowest_note: lowestNote,
          highest_note: highestNote,
          comfortable_low_note: comfortableLowNote,
          comfortable_high_note: comfortableHighNote,
          voice_type: voiceType === 'Ainda não sei' ? suggestion : voiceType,
          notes,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Não foi possível salvar seu perfil vocal agora.');
      }

      setMessage('Mapa vocal salvo com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar seu perfil vocal agora.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="vocal-range-page">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <section className="vocal-range-shell">
        <a className="vocal-range-back" href="/aluno/perfil">← Voltar ao perfil</a>
        <div className="vocal-range-card">
          <p className="vocal-range-kicker">Mapa Vocal</p>
          <h1>Descubra e salve sua extensão vocal.</h1>
          <p>Registre a nota mais grave, a mais aguda e a região confortável da sua voz. Isso ajuda a personalizar seus treinos e acompanhar sua evolução.</p>

          <div className="vocal-range-grid">
            <label className="vocal-range-field"><span>Nota mais grave que você alcança</span><select value={lowestNote} onChange={(e) => setLowestNote(e.target.value)}>{lowNotes.map((note) => <option key={note}>{note}</option>)}</select></label>
            <label className="vocal-range-field"><span>Nota mais aguda que você alcança</span><select value={highestNote} onChange={(e) => setHighestNote(e.target.value)}>{highNotes.map((note) => <option key={note}>{note}</option>)}</select></label>
            <label className="vocal-range-field"><span>Grave confortável</span><select value={comfortableLowNote} onChange={(e) => setComfortableLowNote(e.target.value)}>{lowNotes.map((note) => <option key={note}>{note}</option>)}</select></label>
            <label className="vocal-range-field"><span>Agudo confortável</span><select value={comfortableHighNote} onChange={(e) => setComfortableHighNote(e.target.value)}>{highNotes.map((note) => <option key={note}>{note}</option>)}</select></label>
            <label className="vocal-range-field full"><span>Classificação vocal</span><select value={voiceType} onChange={(e) => setVoiceType(e.target.value)}>{voiceTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="vocal-range-field full"><span>Observações</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: sinto conforto em tons médios, dificuldade nos agudos sustentados..." /></label>
          </div>

          <div className="vocal-range-result">Sugestão inicial: <strong>{suggestion}</strong>. Use apenas como referência, não como diagnóstico definitivo.</div>
          {message ? <div className="vocal-range-result">{message}</div> : null}
          {error ? <div className="vocal-range-error">{error}</div> : null}

          <div className="vocal-range-actions">
            <button className="vocal-range-btn" type="button" onClick={saveProfile} disabled={saving}>{saving ? 'Salvando...' : 'Salvar mapa vocal'}</button>
            <a className="vocal-range-secondary" href="/aluno/biblioteca">Ir para as aulas</a>
          </div>
        </div>
      </section>
    </main>
  );
}
