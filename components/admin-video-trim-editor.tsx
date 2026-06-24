'use client';

import { useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Crown, FileVideo, Lightbulb, Loader2, RotateCcw, Save, Scissors, Sparkles } from 'lucide-react';

type ModuleItem = { id: string; title: string };
type Exercise = Record<string, any>;
type Props = { exercise: Exercise; modules: ModuleItem[] };

function getDriveFileId(url?: string | null) {
  if (!url) return null;
  const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];
  for (const pattern of patterns) { const match = url.match(pattern); if (match?.[1]) return match[1]; }
  return null;
}
function sourceFromExercise(exercise: Exercise) {
  const raw = String(exercise?.drive_url || exercise?.media_url || exercise?.audio_url || '');
  const fileId = getDriveFileId(raw);
  if (fileId) return `/api/media/drive/${fileId}`;
  if (raw.startsWith('/api/') || raw.startsWith('/storage/')) return raw;
  return '';
}
function fmt(value: number) {
  const total = Math.max(0, Math.floor(value || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function secondsToInput(value: number) { const total = Math.max(0, Math.floor(value || 0)); const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function inputToSeconds(value: string) { const parts = value.split(':').map((part) => Number(part || 0)); if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; if (parts.length === 2) return parts[0] * 60 + parts[1]; return Number(value || 0); }

const css = `.admin-video-editor-page{min-height:100vh;background:#05060b;color:#fff;padding:28px 34px 70px}.video-editor-shell{max-width:1480px;margin:0 auto;border:1px solid rgba(255,255,255,.13);border-radius:34px;background:radial-gradient(circle at 88% 0,rgba(245,199,107,.18),transparent 34%),linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.015));box-shadow:0 24px 100px rgba(0,0,0,.38);padding:30px}.video-editor-top{display:flex;justify-content:space-between;align-items:flex-start;gap:22px;margin-bottom:28px}.video-back{display:inline-flex;align-items:center;gap:9px;color:rgba(255,255,255,.72);text-decoration:none;font-weight:850;margin-bottom:28px;border:0;background:transparent;cursor:pointer;font:inherit}.video-editor-title h1{font-size:42px;letter-spacing:-.05em;margin:0 0 10px}.video-editor-title p{color:rgba(255,255,255,.64);font-size:16px;margin:0}.premium-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(245,199,107,.45);border-radius:999px;background:rgba(245,199,107,.1);color:#f5c76b;padding:9px 13px;font-weight:1000;text-transform:uppercase;font-size:12px;letter-spacing:.08em}.save-video-button{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:0;border-radius:14px;background:linear-gradient(135deg,#ffe08a,#c79832);color:#08080c;padding:16px 24px;font-weight:1000;font-size:16px;box-shadow:0 18px 48px rgba(245,199,107,.18);cursor:pointer}.save-video-button:disabled{opacity:.7;cursor:progress}.video-editor-grid{display:grid;grid-template-columns:340px 1fr;gap:22px}.video-side-stack{display:grid;gap:14px}.video-editor-card{border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(9,10,16,.74);padding:20px}.video-editor-card h2{font-size:18px;margin:0 0 18px;letter-spacing:-.025em}.video-editor-card label{display:block;color:rgba(255,255,255,.68);font-weight:800;font-size:13px;margin-top:12px}.video-editor-card input,.video-editor-card select,.video-editor-card textarea{width:100%;margin-top:7px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.055);color:#fff;padding:12px;font:inherit;outline:none}.video-editor-card textarea{min-height:98px;resize:vertical}.field-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.trim-card{border-color:rgba(245,199,107,.2);background:linear-gradient(145deg,rgba(245,199,107,.06),rgba(255,255,255,.025))}.trim-times{display:grid;grid-template-columns:1fr 1fr;gap:12px}.duration-box{border:1px solid rgba(245,199,107,.35);border-radius:16px;background:rgba(245,199,107,.06);padding:18px;text-align:center;margin-top:16px}.duration-box span{display:block;color:rgba(255,255,255,.7);font-weight:800}.duration-box strong{display:block;color:#f5c76b;font-size:30px;margin-top:4px}.tip-box{border:1px solid rgba(245,199,107,.18);border-radius:16px;background:rgba(245,199,107,.055);padding:15px;color:rgba(255,255,255,.7);font-size:13px;line-height:1.45}.tip-box strong{display:flex;align-items:center;gap:8px;color:#f5c76b;margin-bottom:7px}.video-preview-card{border:1px solid rgba(255,255,255,.13);border-radius:24px;background:rgba(9,10,16,.65);padding:22px}.video-preview-card h2{margin:0 0 16px;font-size:18px}.video-frame{position:relative;overflow:hidden;border:1px solid rgba(245,199,107,.24);border-radius:16px;background:#000;aspect-ratio:16/9}.video-frame video{width:100%;height:100%;display:block;background:#000}.video-empty{position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.58);font-weight:900}.pro-timeline{margin-top:22px}.timeline-ruler{display:flex;justify-content:space-between;align-items:center;color:rgba(255,255,255,.54);font-size:12px;font-weight:800;margin:0 2px 9px}.timeline-ruler strong{color:#f5c76b}.filmstrip{position:relative;height:58px;border:1px solid rgba(245,199,107,.34);border-radius:13px;background:#08090d;overflow:visible;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);touch-action:none;user-select:none}.filmstrip-inner{position:absolute;inset:4px;display:grid;grid-template-columns:repeat(10,1fr);gap:2px;overflow:hidden;border-radius:9px}.frame-cell{overflow:hidden;border-radius:5px;background:linear-gradient(145deg,#23242b,#090a0e)}.frame-cell img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.94) contrast(1.05)}.frame-fallback{display:block;width:100%;height:100%;background:radial-gradient(circle at 50% 40%,rgba(245,199,107,.3),transparent 34%),linear-gradient(160deg,#222631,#090a10)}.trim-mask{position:absolute;top:0;bottom:0;background:rgba(0,0,0,.56);z-index:3;pointer-events:none}.trim-window{position:absolute;top:0;bottom:0;border:2px solid #f5c76b;border-radius:12px;z-index:4;background:rgba(245,199,107,.05);box-shadow:0 0 0 1px rgba(255,255,255,.12) inset;pointer-events:none}.trim-handle{position:absolute;top:50%;z-index:12;transform:translate(-50%,-50%);width:22px;height:72px;border:3px solid #f5c76b;border-radius:10px;background:#fff;box-shadow:0 12px 28px rgba(0,0,0,.42);cursor:ew-resize;touch-action:none}.trim-handle:active{cursor:grabbing;box-shadow:0 0 0 6px rgba(245,199,107,.16),0 12px 28px rgba(0,0,0,.42)}.time-pop{position:absolute;z-index:13;top:-36px;transform:translateX(-50%);border:1px solid rgba(245,199,107,.36);border-radius:9px;background:#121218;color:#f5c76b;padding:7px 10px;font-weight:950;font-size:12px;white-space:nowrap;pointer-events:none}.playhead{position:absolute;top:0;bottom:0;width:2px;background:#fff;z-index:7;box-shadow:0 0 18px rgba(255,255,255,.55);pointer-events:none}.timeline-actions{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:14px}.reset-cut{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(245,199,107,.26);border-radius:12px;background:transparent;color:#f5c76b;padding:12px 16px;font-weight:900;cursor:pointer}.video-editor-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px;border-top:1px solid rgba(255,255,255,.09);padding-top:18px}.stat-box{display:flex;align-items:center;gap:12px;color:rgba(255,255,255,.68)}.stat-box svg{color:#f5c76b}.stat-box strong{display:block;color:#fff}.loading-frames{position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.55);font-size:12px;font-weight:900;background:rgba(0,0,0,.18);z-index:2;border-radius:12px}.save-status{display:inline-flex;align-items:center;gap:8px;margin-top:12px;color:#51e38a;font-weight:900}.save-status.bad{color:#ff7f7f}@media(max-width:980px){.admin-video-editor-page{padding:18px 14px 90px}.video-editor-shell{padding:18px;border-radius:26px}.video-editor-top{display:grid}.video-editor-title h1{font-size:34px}.video-editor-grid{grid-template-columns:1fr}.video-editor-stats{grid-template-columns:1fr}.save-video-button{width:100%}.filmstrip{height:52px}.trim-handle{height:66px}}`;

export function AdminVideoTrimEditor({ exercise, modules }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const source = useMemo(() => sourceFromExercise(exercise), [exercise]);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(Number(exercise?.trim_start_seconds || 0));
  const [end, setEnd] = useState(Number(exercise?.trim_end_seconds || 0));
  const [current, setCurrent] = useState(0);
  const [frames, setFrames] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const safeEnd = end > 0 ? Math.min(end, duration || end) : duration;
  const finalDuration = Math.max(0, (safeEnd || 0) - start);
  const startPct = duration ? Math.max(0, Math.min(100, (start / duration) * 100)) : 0;
  const endPct = duration ? Math.max(0, Math.min(100, (safeEnd / duration) * 100)) : 100;
  const currentPct = duration ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
    else window.location.href = '/admin/produtos';
  }
  function seek(value: number) { const video = videoRef.current; if (video && Number.isFinite(value)) video.currentTime = Math.max(0, Math.min(value, duration || value)); }
  function setStartValue(value: number) { const next = Math.max(0, Math.min(value, Math.max(0, safeEnd - 1))); setStart(next); seek(next); }
  function setEndValue(value: number) { const next = Math.max(start + 1, Math.min(value, duration || value)); setEnd(next); seek(Math.max(start, next - 1)); }
  function resetCut() { setStart(0); setEnd(duration || 0); seek(0); }
  function secondsFromClientX(clientX: number) { const rect = timelineRef.current?.getBoundingClientRect(); if (!rect || !duration) return 0; return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration; }
  function beginDrag(kind: 'start' | 'end', event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation();
    const update = (clientX: number) => kind === 'start' ? setStartValue(secondsFromClientX(clientX)) : setEndValue(secondsFromClientX(clientX));
    update(event.clientX);
    const move = (moveEvent: PointerEvent) => update(moveEvent.clientX);
    const done = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', done, { once: true }); window.addEventListener('pointercancel', done, { once: true });
  }
  function pickNearestHandle(event: ReactPointerEvent<HTMLDivElement>) { if (!duration) return; const seconds = secondsFromClientX(event.clientX); Math.abs(seconds - start) <= Math.abs(seconds - safeEnd) ? setStartValue(seconds) : setEndValue(seconds); }

  async function captureFrames(video: HTMLVideoElement) {
    if (!video.duration || !Number.isFinite(video.duration) || frames.length) return;
    const cacheKey = `trim-frames:${exercise?.id}:${Math.floor(video.duration)}`;
    try { const cached = localStorage.getItem(cacheKey); if (cached) { setFrames(JSON.parse(cached)); return; } } catch {}
    setCapturing(true);
    const run = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 54;
      const ctx = canvas.getContext('2d'); if (!ctx) { setCapturing(false); return; }
      const original = video.currentTime; const total = 10; const nextFrames: string[] = [];
      const waitSeek = () => new Promise<void>((resolve) => { const done = () => { video.removeEventListener('seeked', done); resolve(); }; video.addEventListener('seeked', done, { once: true }); window.setTimeout(done, 220); });
      for (let i = 0; i < total; i += 1) {
        video.currentTime = Math.min(video.duration - 0.2, (video.duration * i) / Math.max(1, total - 1));
        await waitSeek();
        const vw = video.videoWidth || 96, vh = video.videoHeight || 54, scale = Math.max(canvas.width / vw, canvas.height / vh), sw = canvas.width / scale, sh = canvas.height / scale;
        ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
        nextFrames.push(canvas.toDataURL('image/jpeg', .45));
        if (i === 3) setFrames([...nextFrames]);
      }
      video.currentTime = Math.min(original || start || 0, video.duration - .2);
      setFrames(nextFrames); setCapturing(false);
      try { localStorage.setItem(cacheKey, JSON.stringify(nextFrames)); } catch {}
    };
    window.setTimeout(run, 120);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setStatus(null);
    const form = event.currentTarget;
    const body = new FormData(form);
    body.set('trim_start_seconds', String(Math.round(start)));
    body.set('trim_end_seconds', String(Math.round(safeEnd || 0)));
    try {
      const response = await fetch(form.action, { method: 'POST', body, headers: { Accept: 'application/json', 'x-requested-with': 'fetch' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Não foi possível salvar.');
      setStatus({ ok: true, text: 'Corte salvo sem recarregar a página.' });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : 'Falha ao salvar.' });
    } finally { setSaving(false); }
  }

  return (
    <main className="admin-video-editor-page"><style dangerouslySetInnerHTML={{ __html: css }} />
      <form className="video-editor-shell" action={`/admin/conteudos/exercicios/${exercise?.id}/editar/salvar`} method="post" onSubmit={handleSubmit}>
        <div className="video-editor-top"><div className="video-editor-title"><button type="button" className="video-back" onClick={goBack}><ArrowLeft size={18} /> Voltar para onde estava</button><h1>Editar vídeo da aula <span className="premium-pill"><Crown size={15} /> Premium</span></h1><p>Ajuste o início e o fim do vídeo para remover introduções, finais e partes desnecessárias.</p>{status ? <span className={status.ok ? 'save-status' : 'save-status bad'}>{status.ok ? <CheckCircle2 size={16} /> : null}{status.text}</span> : null}</div><button className="save-video-button" type="submit" disabled={saving}>{saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
        <input type="hidden" name="trim_start_seconds" value={Math.round(start)} /><input type="hidden" name="trim_end_seconds" value={Math.round(safeEnd || 0)} />
        <div className="video-editor-grid"><aside className="video-side-stack"><section className="video-editor-card"><h2>Informações do vídeo</h2><label>Título<input name="title" defaultValue={exercise?.title || ''} required /></label><label>Módulo<select name="module_id" defaultValue={exercise?.module_id || ''} required>{modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}</select></label><div className="field-grid-2"><label>Nível<select name="difficulty" defaultValue={String(exercise?.difficulty || 1)}>{[1,2,3,4,5].map((level) => <option value={level} key={level}>{level}</option>)}</select></label><label>Tipo<select name="media_type" defaultValue={exercise?.media_type || 'video'}><option value="video">Vídeo</option><option value="audio">Áudio</option><option value="dueto">Dueto</option></select></label></div><label>Link Drive<input name="drive_url" defaultValue={exercise?.drive_url || ''} /></label><label>Descrição<textarea name="description" defaultValue={exercise?.description || ''} /></label><label>Objetivo<textarea name="objective" defaultValue={exercise?.objective || ''} /></label></section><section className="video-editor-card trim-card"><h2>Corte do vídeo <span className="premium-pill"><Crown size={13} /> Premium</span></h2><div className="trim-times"><label>Início<input value={secondsToInput(start)} onChange={(event) => setStartValue(inputToSeconds(event.target.value))} /></label><label>Fim<input value={secondsToInput(safeEnd || 0)} onChange={(event) => setEndValue(inputToSeconds(event.target.value))} /></label></div><div className="duration-box"><span>Duração final</span><strong>{fmt(finalDuration)}</strong></div><div className="tip-box"><strong><Lightbulb size={15} /> Dica</strong>O salvamento agora acontece sem recarregar. Use Voltar para retornar à tela anterior.</div></section></aside>
          <section className="video-preview-card"><h2>Preview do vídeo</h2><div className="video-frame">{source ? <video ref={videoRef} src={source} controls preload="metadata" onLoadedMetadata={(event) => { const d = event.currentTarget.duration || 0; setDuration(d); if (!end && d) setEnd(d); if (start > 0) event.currentTarget.currentTime = start; captureFrames(event.currentTarget); }} onTimeUpdate={(event) => { setCurrent(event.currentTarget.currentTime || 0); if (safeEnd && event.currentTarget.currentTime >= safeEnd) event.currentTarget.pause(); }} /> : <div className="video-empty"><FileVideo size={28} /> Vídeo indisponível</div>}</div>
            <div className="pro-timeline"><div className="timeline-ruler"><span>00:00</span><strong>{fmt(start)} — {fmt(safeEnd || 0)}</strong><span>{fmt(duration)}</span></div><div ref={timelineRef} className="filmstrip" onPointerDown={pickNearestHandle}><div className="filmstrip-inner">{Array.from({ length: 10 }).map((_, index) => <span className="frame-cell" key={index}>{frames[index] ? <img src={frames[index]} alt="frame" /> : <span className="frame-fallback" />}</span>)}</div>{capturing ? <div className="loading-frames">gerando prévia rápida...</div> : null}<span className="trim-mask" style={{ left: 0, width: `${startPct}%` }} /><span className="trim-mask" style={{ left: `${endPct}%`, right: 0 }} /><span className="trim-window" style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }} /><span className="time-pop" style={{ left: `${startPct}%` }}>{fmt(start)}</span><span className="time-pop" style={{ left: `${endPct}%` }}>{fmt(safeEnd || 0)}</span><span className="playhead" style={{ left: `${currentPct}%` }} /><button type="button" className="trim-handle" style={{ left: `${startPct}%` }} onPointerDown={(event) => beginDrag('start', event)} aria-label="Arrastar início do corte" /><button type="button" className="trim-handle" style={{ left: `${endPct}%` }} onPointerDown={(event) => beginDrag('end', event)} aria-label="Arrastar fim do corte" /></div><div className="timeline-actions"><button className="reset-cut" type="button" onClick={resetCut}><RotateCcw size={16} /> Redefinir corte</button></div></div>
            <div className="video-editor-stats"><div className="stat-box"><Clock3 size={30} /><div><span>Duração original</span><strong>{fmt(duration)}</strong></div></div><div className="stat-box"><Scissors size={30} /><div><span>Parte selecionada</span><strong>{fmt(finalDuration)}</strong></div></div><div className="stat-box"><Sparkles size={30} /><div><span>Será exibido ao aluno</span><strong>Apenas o corte</strong></div></div></div></section></div>
      </form></main>
  );
}
