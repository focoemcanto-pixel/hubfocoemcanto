'use client';

import { useMemo, useState } from 'react';

type Study = { id: string; song_name: string; youtube_url: string; youtube_video_id: string | null; original_key: string; study_key: string; semitone_transposition: number; bpm: number | null; notes: string | null; summary: string | null; updated_at: string };
type FormState = { songName: string; youtubeUrl: string; originalKey: string; studyKey: string; semitones: string; bpm: string; notes: string };
type YouTubeResult = { videoId: string; title: string; channelTitle: string; thumbnail: string; url: string; publishedAt: string | null };

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
  } catch { return ''; }
  return '';
}

function formatSemitones(value: string) { const semitones = Number(value || 0); return `${semitones > 0 ? '+' : ''}${semitones} semitom(ns)`; }
function buildSummary(form: FormState) { return [`🎶 Estudo de Repertório — ${form.songName || 'Música sem nome'}`, '', `Link: ${form.youtubeUrl || 'Não informado'}`, `Tom original: ${form.originalKey}`, `Meu tom: ${form.studyKey}`, `Transposição: ${formatSemitones(form.semitones)}`, form.bpm ? `BPM: ${form.bpm}` : 'BPM: não definido', '', 'Observações:', form.notes || 'Sem observações.', '', 'Preparado no Hub Foco em Canto.'].join('\n'); }
function studyToForm(study: Study): FormState { return { songName: study.song_name, youtubeUrl: study.youtube_url, originalKey: study.original_key, studyKey: study.study_key, semitones: String(study.semitone_transposition), bpm: study.bpm ? String(study.bpm) : '', notes: study.notes || '' }; }

export function RepertoireStudyClient({ initialStudies }: { initialStudies: Study[] }) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [studies, setStudies] = useState<Study[]>(initialStudies);
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualLinkOpen, setManualLinkOpen] = useState(false);
  const videoId = useMemo(() => extractYouTubeId(form.youtubeUrl), [form.youtubeUrl]);
  const embedUrl = videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : '';
  const currentSummary = summary || buildSummary(form);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(currentSummary)}`;
  const selectedStudy = studies.find((study) => study.id === selectedStudyId) || null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); setSummary(''); }
  function generate() { const next = buildSummary(form); setSummary(next); return next; }
  function startNewStudy() { setForm(initialForm); setSelectedStudyId(null); setSummary(''); setSearchQuery(''); setResults([]); setStatus('Novo estudo iniciado.'); }
  function loadStudy(study: Study) { setForm(studyToForm(study)); setSelectedStudyId(study.id); setSummary(study.summary || ''); setStatus(`Editando: ${study.song_name}`); }
  function duplicateStudy(study: Study) { setForm({ ...studyToForm(study), songName: `${study.song_name} — nova versão` }); setSelectedStudyId(null); setSummary(''); setStatus('Versão duplicada. Ajuste o tom e salve como novo estudo.'); }

  async function searchYouTube(event?: React.FormEvent) {
    event?.preventDefault();
    if (!searchQuery.trim()) { setStatus('Digite o nome da música para pesquisar.'); return; }
    setSearching(true); setStatus('Pesquisando no YouTube...');
    try {
      const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Não foi possível pesquisar no YouTube.');
      setResults(data.items || []);
      setStatus(data.items?.length ? 'Escolha um vídeo para abrir no estudo.' : 'Nenhum vídeo encontrado para essa busca.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível pesquisar.'); }
    finally { setSearching(false); }
  }

  function selectVideo(video: YouTubeResult) {
    setForm((current) => ({ ...current, songName: current.songName || searchQuery || video.title, youtubeUrl: video.url }));
    setSelectedStudyId(null); setSummary(''); setStatus(`Vídeo selecionado: ${video.title}`);
  }

  async function saveStudy() {
    setSaving(true); setStatus(selectedStudyId ? 'Atualizando estudo...' : 'Salvando estudo...');
    const nextSummary = summary || generate();
    const payload = { ...(selectedStudyId ? { id: selectedStudyId } : {}), songName: form.songName, youtubeUrl: form.youtubeUrl, originalKey: form.originalKey, studyKey: form.studyKey, semitoneTransposition: Number(form.semitones || 0), bpm: form.bpm ? Number(form.bpm) : null, notes: form.notes, summary: nextSummary };
    try {
      const response = await fetch('/api/repertoire-studies', { method: selectedStudyId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Erro ao salvar.');
      setStudies((current) => [data.study, ...current.filter((item) => item.id !== data.study.id)]);
      setSelectedStudyId(data.study.id); setSummary(data.study.summary || nextSummary);
      setStatus(data.mode === 'updated-existing' ? 'Já existia um estudo para esse vídeo. Atualizei a versão salva.' : selectedStudyId ? 'Estudo atualizado com sucesso.' : 'Estudo salvo com segurança no seu perfil.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }

  async function deleteStudy(study: Study) {
    if (!window.confirm(`Excluir o estudo "${study.song_name}"?`)) return;
    setDeletingId(study.id); setStatus('Excluindo estudo...');
    try {
      const response = await fetch(`/api/repertoire-studies?id=${encodeURIComponent(study.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Erro ao excluir.');
      setStudies((current) => current.filter((item) => item.id !== study.id));
      if (selectedStudyId === study.id) startNewStudy();
      setStatus('Estudo excluído.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível excluir.'); }
    finally { setDeletingId(null); }
  }

  async function copySummary() { const text = summary || generate(); await navigator.clipboard.writeText(text); setStatus('Resumo copiado. Agora é só colar no grupo da banda.'); }

  return <div className="repertoire-layout">
    <section className="repertoire-panel main-panel">
      <div className="panel-heading"><p className="eyebrow">Caderno digital de repertório</p><h2>{selectedStudy ? 'Edite seu estudo salvo' : 'Monte seu estudo da música'}</h2><span>Pesquise no YouTube dentro do Hub, escolha o vídeo e organize o tom para a banda.</span></div>
      {selectedStudy ? <div className="editing-banner"><span>Editando</span><strong>{selectedStudy.song_name}</strong><button type="button" onClick={startNewStudy}>Novo estudo</button></div> : null}

      <form className="youtube-search-box" onSubmit={searchYouTube}>
        <label>Pesquisar música no YouTube<input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Ex.: Bondade de Deus Isaias Saad playback" /></label>
        <button type="submit" disabled={searching}>{searching ? 'Pesquisando...' : 'Pesquisar'}</button>
      </form>

      {results.length ? <div className="youtube-results">{results.map((video) => <button type="button" className={`youtube-result ${video.url === form.youtubeUrl ? 'selected' : ''}`} key={video.videoId} onClick={() => selectVideo(video)}>{video.thumbnail ? <img src={video.thumbnail} alt="" /> : <span className="thumb-fallback">▶</span>}<span><strong>{video.title}</strong><small>{video.channelTitle}</small></span></button>)}</div> : null}

      <button type="button" className="manual-link-toggle" onClick={() => setManualLinkOpen((value) => !value)}>{manualLinkOpen ? 'Ocultar link manual' : 'Tenho o link do YouTube'}</button>
      {manualLinkOpen ? <label>Link do YouTube<input value={form.youtubeUrl} onChange={(event) => update('youtubeUrl', event.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></label> : null}

      <label>Nome da música<input value={form.songName} onChange={(event) => update('songName', event.target.value)} placeholder="Ex.: Bondade de Deus" /></label>
      <div className="video-shell">{embedUrl ? <iframe src={embedUrl} title={`Vídeo para estudar ${form.songName || 'repertório'}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <div><strong>Pesquise e selecione um vídeo do YouTube.</strong><p>O estudo abre aqui sem baixar áudio ou vídeo.</p></div>}</div>
      <div className="control-grid"><label>Tom original<select value={form.originalKey} onChange={(event) => update('originalKey', event.target.value)}>{keys.map((key) => <option key={key}>{key}</option>)}</select></label><label>Meu tom<select value={form.studyKey} onChange={(event) => update('studyKey', event.target.value)}>{keys.map((key) => <option key={key}>{key}</option>)}</select></label><label>Transposição<input type="number" min="-12" max="12" value={form.semitones} onChange={(event) => update('semitones', event.target.value)} /></label><label>BPM opcional<input type="number" min="30" max="260" value={form.bpm} onChange={(event) => update('bpm', event.target.value)} placeholder="Ex.: 72" /></label></div>
      <label>Observações<textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Entradas, dinâmica, respirações, divisão, dicas para backing vocal..." /></label>
      <div className="action-row"><button onClick={() => generate()}>Gerar resumo</button><button onClick={saveStudy} disabled={saving}>{saving ? 'Salvando...' : selectedStudyId ? 'Atualizar estudo' : 'Salvar estudo'}</button><button onClick={copySummary}>Copiar resumo</button><a href={whatsappUrl} target="_blank" rel="noreferrer">Enviar no WhatsApp</a></div>
      {status ? <p className="save-status">{status}</p> : null}
    </section>
    <aside className="repertoire-panel summary-panel"><p className="eyebrow">Resumo compartilhável</p><pre>{currentSummary}</pre><div className="saved-header"><h3>Estudos salvos</h3><button type="button" onClick={startNewStudy}>+</button></div>{studies.length ? studies.map((study) => <article className={`saved-study-card ${selectedStudyId === study.id ? 'active' : ''}`} key={study.id}><button className="saved-study-main" onClick={() => loadStudy(study)}><strong>{study.song_name}</strong><span>{study.original_key} → {study.study_key} · {formatSemitones(String(study.semitone_transposition))}</span><small>{new Date(study.updated_at).toLocaleDateString('pt-BR')}</small></button><div className="saved-study-actions"><button type="button" onClick={() => loadStudy(study)}>Editar</button><button type="button" onClick={() => duplicateStudy(study)}>Duplicar</button><button type="button" disabled={deletingId === study.id} onClick={() => deleteStudy(study)}>{deletingId === study.id ? '...' : 'Excluir'}</button></div></article>) : <div className="empty-list"><strong>Nenhum estudo salvo ainda.</strong><span>Salve sua primeira música para montar seu caderno digital de repertório.</span></div>}</aside>
  </div>;
}
