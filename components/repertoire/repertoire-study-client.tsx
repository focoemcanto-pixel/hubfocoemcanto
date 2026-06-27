'use client';

import { useMemo, useState } from 'react';

type Study = {
  id: string;
  song_name: string;
  youtube_url: string;
  youtube_video_id: string | null;
  original_key: string;
  study_key: string;
  semitone_transposition: number;
  bpm: number | null;
  notes: string | null;
  summary: string | null;
  updated_at: string;
};

type FormState = {
  songName: string;
  youtubeUrl: string;
  originalKey: string;
  studyKey: string;
  semitones: string;
  bpm: string;
  notes: string;
};

const keys = ['C', 'C# / Db', 'D', 'D# / Eb', 'E', 'F', 'F# / Gb', 'G', 'G# / Ab', 'A', 'A# / Bb', 'B', 'Cm', 'C#m / Dbm', 'Dm', 'D#m / Ebm', 'Em', 'Fm', 'F#m / Gbm', 'Gm', 'G#m / Abm', 'Am', 'A#m / Bbm', 'Bm'];

const initialForm: FormState = { songName: '', youtubeUrl: '', originalKey: 'G', studyKey: 'G', semitones: '0', bpm: '', notes: '' };

function extractYouTubeId(url: string) {
  const value = url.trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/').filter(Boolean)[1] || '';
      return parsed.searchParams.get('v') || '';
    }
  } catch {
    return '';
  }
  return '';
}

function buildSummary(form: FormState) {
  return [`🎶 Estudo de Repertório — ${form.songName || 'Música sem nome'}`, '', `Link: ${form.youtubeUrl || 'Não informado'}`, `Tom original: ${form.originalKey}`, `Meu tom: ${form.studyKey}`, `Transposição: ${Number(form.semitones || 0) > 0 ? '+' : ''}${Number(form.semitones || 0)} semitom(ns)`, form.bpm ? `BPM: ${form.bpm}` : 'BPM: não definido', '', 'Observações:', form.notes || 'Sem observações.', '', 'Preparado no Hub Foco em Canto.'].join('\n');
}

export function RepertoireStudyClient({ initialStudies }: { initialStudies: Study[] }) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [studies, setStudies] = useState<Study[]>(initialStudies);
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const videoId = useMemo(() => extractYouTubeId(form.youtubeUrl), [form.youtubeUrl]);
  const embedUrl = videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : '';

  function update<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function generate() { const next = buildSummary(form); setSummary(next); return next; }

  async function saveStudy() {
    setSaving(true); setStatus('Salvando estudo...');
    const nextSummary = summary || generate();
    try {
      const response = await fetch('/api/repertoire-studies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songName: form.songName, youtubeUrl: form.youtubeUrl, originalKey: form.originalKey, studyKey: form.studyKey, semitoneTransposition: Number(form.semitones || 0), bpm: form.bpm ? Number(form.bpm) : null, notes: form.notes, summary: nextSummary }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Erro ao salvar.');
      setStudies((current) => [data.study, ...current.filter((item) => item.id !== data.study.id)]);
      setStatus('Estudo salvo com segurança no seu perfil.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }

  async function copySummary() {
    const text = summary || generate();
    await navigator.clipboard.writeText(text);
    setStatus('Resumo copiado.');
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(summary || buildSummary(form))}`;

  return <div className="repertoire-layout">
    <section className="repertoire-panel main-panel">
      <div className="panel-heading"><p className="eyebrow">MVP de estudo</p><h2>Monte seu estudo da música</h2><span>Sem baixar áudio ou vídeo: use o YouTube incorporado como referência.</span></div>
      <label>Nome da música<input value={form.songName} onChange={(event) => update('songName', event.target.value)} placeholder="Ex.: Bondade de Deus" /></label>
      <label>Link do YouTube<input value={form.youtubeUrl} onChange={(event) => update('youtubeUrl', event.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></label>
      <div className="video-shell">{embedUrl ? <iframe src={embedUrl} title={`Vídeo para estudar ${form.songName || 'repertório'}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <div><strong>Cole um link válido do YouTube.</strong><p>Usaremos youtube-nocookie.com para renderizar um embed seguro.</p></div>}</div>
      <div className="control-grid">
        <label>Tom original<select value={form.originalKey} onChange={(event) => update('originalKey', event.target.value)}>{keys.map((key) => <option key={key}>{key}</option>)}</select></label>
        <label>Meu tom<select value={form.studyKey} onChange={(event) => update('studyKey', event.target.value)}>{keys.map((key) => <option key={key}>{key}</option>)}</select></label>
        <label>Transposição<input type="number" min="-12" max="12" value={form.semitones} onChange={(event) => update('semitones', event.target.value)} /></label>
        <label>BPM opcional<input type="number" min="30" max="260" value={form.bpm} onChange={(event) => update('bpm', event.target.value)} placeholder="Ex.: 72" /></label>
      </div>
      <label>Observações<textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Entradas, dinâmica, respirações, divisão, dicas para backing vocal..." /></label>
      <div className="action-row"><button onClick={() => generate()}>Gerar resumo</button><button onClick={saveStudy} disabled={saving}>{saving ? 'Salvando...' : 'Salvar estudo'}</button><button onClick={copySummary}>Copiar resumo</button><a href={whatsappUrl} target="_blank" rel="noreferrer">Enviar no WhatsApp</a></div>
      {status ? <p className="save-status">{status}</p> : null}
    </section>
    <aside className="repertoire-panel summary-panel"><p className="eyebrow">Resumo compartilhável</p><pre>{summary || buildSummary(form)}</pre><h3>Estudos salvos</h3>{studies.length ? studies.map((study) => <button className="saved-study" key={study.id} onClick={() => { setForm({ songName: study.song_name, youtubeUrl: study.youtube_url, originalKey: study.original_key, studyKey: study.study_key, semitones: String(study.semitone_transposition), bpm: study.bpm ? String(study.bpm) : '', notes: study.notes || '' }); setSummary(study.summary || ''); }}><strong>{study.song_name}</strong><span>{study.original_key} → {study.study_key} · {new Date(study.updated_at).toLocaleDateString('pt-BR')}</span></button>) : <p className="empty-list">Seus estudos salvos aparecerão aqui.</p>}</aside>
  </div>;
}
