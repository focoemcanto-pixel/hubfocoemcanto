'use client';

import { useEffect, useMemo, useState } from 'react';

export type VoiceStudioMarkerKind = 'marker' | 'section' | 'region' | 'loop';

export type VoiceStudioMarker = {
  id: string;
  kind: VoiceStudioMarkerKind;
  name: string;
  start: number;
  end?: number;
  color: string;
  locked: boolean;
  active?: boolean;
};

type Props = {
  projectId: string;
  duration: number;
  playhead: number;
  readOnly?: boolean;
  onSeek?: (seconds: number) => void;
  onChange?: (markers: VoiceStudioMarker[]) => void;
  onLoopChange?: (loop: { enabled: boolean; start: number; end: number } | null) => void;
};

const COLORS = ['#8b5cf6', '#0ea5e9', '#22c55e', '#f97316', '#ec4899', '#eab308'];
const STORAGE_PREFIX = 'foco-voice-studio-markers:';
export const MARKERS_CHANGED_EVENT = 'foco-voice-studio-markers-changed';

function storageKey(projectId: string) {
  return `${STORAGE_PREFIX}${projectId}`;
}

function safeTime(value: number, duration: number) {
  return Math.min(Math.max(0, value), Math.max(0, duration));
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${tenths}`;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
}

export function loadVoiceStudioMarkers(projectId: string): VoiceStudioMarker[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(projectId)) || '[]') as VoiceStudioMarker[];
    return Array.isArray(parsed) ? parsed.filter(item => item?.id && item?.kind && Number.isFinite(item.start)) : [];
  } catch {
    return [];
  }
}

export function saveVoiceStudioMarkers(projectId: string, markers: VoiceStudioMarker[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(projectId), JSON.stringify(markers));
}

export default function VoiceStudioMarkers({ projectId, duration, playhead, readOnly = false, onSeek, onChange, onLoopChange }: Props) {
  const [markers, setMarkers] = useState<VoiceStudioMarker[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setMarkers(loadVoiceStudioMarkers(projectId));
    setSelectedId('');
  }, [projectId]);

  useEffect(() => {
    saveVoiceStudioMarkers(projectId, markers);
    onChange?.(markers);
    window.dispatchEvent(new CustomEvent(MARKERS_CHANGED_EVENT, { detail: { projectId, markers } }));
    const activeLoop = markers.find(item => item.kind === 'loop' && item.active !== false && item.end && item.end > item.start);
    onLoopChange?.(activeLoop ? { enabled: true, start: activeLoop.start, end: activeLoop.end! } : null);
  }, [markers, onChange, onLoopChange, projectId]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (readOnly || isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'm') return;
      event.preventDefault();
      create(event.shiftKey ? 'section' : 'marker');
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  });

  const ordered = useMemo(() => [...markers].sort((a, b) => a.start - b.start), [markers]);
  const selected = markers.find(item => item.id === selectedId) || null;

  function create(kind: VoiceStudioMarkerKind) {
    if (readOnly) return;
    const start = safeTime(playhead, duration);
    const defaultLength = Math.max(1, Math.min(8, duration - start));
    const marker: VoiceStudioMarker = {
      id: crypto.randomUUID(),
      kind,
      name: kind === 'marker' ? 'Novo marcador' : kind === 'section' ? 'Nova seção' : kind === 'region' ? 'Nova região' : 'Loop',
      start,
      end: kind === 'marker' ? undefined : safeTime(start + defaultLength, duration),
      color: COLORS[markers.length % COLORS.length],
      locked: false,
      active: kind === 'loop' ? !markers.some(item => item.kind === 'loop' && item.active !== false) : undefined,
    };
    setMarkers(current => [...current, marker]);
    setSelectedId(marker.id);
  }

  function patch(id: string, patchValue: Partial<VoiceStudioMarker>) {
    if (readOnly) return;
    setMarkers(current => current.map(item => item.id === id && !item.locked ? { ...item, ...patchValue } : item));
  }

  function remove(id: string) {
    if (readOnly) return;
    setMarkers(current => current.filter(item => item.id !== id || item.locked));
    setSelectedId(current => current === id ? '' : current);
  }

  function duplicate(item: VoiceStudioMarker) {
    if (readOnly) return;
    const offset = Math.min(1, Math.max(.1, duration / 100));
    const start = safeTime(item.start + offset, duration);
    const length = item.end ? item.end - item.start : 0;
    const copy: VoiceStudioMarker = {
      ...item,
      id: crypto.randomUUID(),
      name: `${item.name} cópia`,
      start,
      end: item.end ? safeTime(start + length, duration) : undefined,
      locked: false,
      active: item.kind === 'loop' ? false : item.active,
    };
    setMarkers(current => [...current, copy]);
    setSelectedId(copy.id);
  }

  function activateLoop(id: string) {
    if (readOnly) return;
    setMarkers(current => current.map(item => item.kind === 'loop' ? { ...item, active: item.id === id ? item.active === false : false } : item));
  }

  return <section className={`vs-markers ${open ? 'open' : 'closed'}`}>
    <style>{`
      .vs-markers{border-top:1px solid #2c313d;background:#151922;color:#e5e7eb;font-size:12px}
      .vs-markers>header{height:42px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid #2c313d}
      .vs-markers>header strong{margin-right:auto}.vs-markers button,.vs-markers input,.vs-markers select{border:1px solid #343946;border-radius:7px;background:#1b1f28;color:#e5e7eb;height:30px;padding:0 9px}
      .vs-markers button{cursor:pointer}.vs-markers button:hover{background:#252b38}.vs-marker-ruler{position:relative;height:56px;overflow:hidden;background:linear-gradient(#181d27,#141821)}
      .vs-marker-item{position:absolute;top:7px;height:42px;min-width:8px;border:0!important;border-radius:5px!important;padding:0!important;box-shadow:0 0 0 1px rgba(255,255,255,.2);overflow:visible;opacity:.72}
      .vs-marker-item.active{opacity:1;box-shadow:0 0 0 2px #fff,0 0 18px rgba(139,92,246,.38)}
      .vs-marker-item.marker{width:3px!important;min-width:3px}.vs-marker-item.marker:before{content:'';position:absolute;left:-5px;top:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid var(--marker)}
      .vs-marker-item span{position:absolute;left:5px;top:9px;white-space:nowrap;font-size:10px;font-weight:800;text-shadow:0 1px 2px #000}.vs-marker-list{max-height:180px;overflow:auto}
      .vs-marker-row{display:grid;grid-template-columns:90px minmax(130px,1fr) 90px 90px 72px 72px;gap:7px;align-items:center;padding:6px 10px;border-bottom:1px solid #242a35}.vs-marker-row.selected{background:rgba(139,92,246,.13)}
      .vs-marker-row i{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px}.vs-marker-row small{color:#9299a8}.vs-marker-row .danger{color:#fca5a5}.vs-marker-row .loop-active{color:#86efac;border-color:#166534}.vs-marker-editor{display:flex;gap:8px;padding:9px 10px;align-items:center;background:#12161e}.vs-marker-editor label{display:flex;align-items:center;gap:5px}.vs-markers.closed .vs-marker-ruler,.vs-markers.closed .vs-marker-list,.vs-markers.closed .vs-marker-editor{display:none}
      @media(max-width:900px){.vs-markers>header button span{display:none}.vs-marker-row{grid-template-columns:70px 1fr 70px 52px 38px}.vs-marker-row .end,.vs-marker-row .duplicate{display:none}.vs-marker-editor{overflow:auto}}
    `}</style>
    <header>
      <strong>Markers & Regiões <small>({markers.length})</small></strong>
      {!readOnly && <><button title="Atalho: M" onClick={() => create('marker')}>＋ <span>Marker</span></button><button title="Atalho: Shift+M" onClick={() => create('section')}>＋ <span>Section</span></button><button onClick={() => create('region')}>＋ <span>Region</span></button><button onClick={() => create('loop')}>↻ <span>Loop</span></button></>}
      <button onClick={() => setOpen(value => !value)}>{open ? '⌄' : '⌃'}</button>
    </header>
    <div className="vs-marker-ruler">
      {ordered.map(item => {
        const left = duration > 0 ? item.start / duration * 100 : 0;
        const width = item.end && duration > 0 ? Math.max(.5, (item.end - item.start) / duration * 100) : 0;
        const active = item.kind !== 'loop' || item.active !== false;
        return <button key={item.id} className={`vs-marker-item ${item.kind} ${active ? 'active' : ''}`} style={{ left: `${left}%`, width: item.kind === 'marker' ? undefined : `${width}%`, background: item.color, '--marker': item.color } as React.CSSProperties} onClick={() => { setSelectedId(item.id); onSeek?.(item.start); }} title={`${item.name} · ${formatTime(item.start)}`}><span>{item.name}</span></button>;
      })}
    </div>
    <div className="vs-marker-list">
      {ordered.map(item => <div key={item.id} className={`vs-marker-row ${selectedId === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}>
        <b><i style={{ background: item.color }}/>{item.kind.toUpperCase()}</b>
        <input disabled={readOnly || item.locked} value={item.name} onChange={event => patch(item.id, { name: event.target.value })}/>
        <button onClick={() => onSeek?.(item.start)}>{formatTime(item.start)}</button>
        <small className="end">{item.end ? formatTime(item.end) : '—'}</small>
        {!readOnly && item.kind === 'loop' ? <button className={item.active !== false ? 'loop-active' : ''} onClick={() => activateLoop(item.id)}>{item.active !== false ? 'Ativo' : 'Inativo'}</button> : <span/>}
        {!readOnly && <button className="duplicate" onClick={() => duplicate(item)}>Duplicar</button>}
        {!readOnly && <button className="danger" onClick={() => remove(item.id)}>×</button>}
      </div>)}
      {!markers.length && <div className="vs-marker-row"><small>Adicione markers, seções, regiões ou um loop na posição atual do playhead.</small></div>}
    </div>
    {selected && <div className="vs-marker-editor">
      <label>Início <input type="number" min="0" max={duration} step="0.1" disabled={readOnly || selected.locked} value={selected.start} onChange={event => patch(selected.id, { start: safeTime(Number(event.target.value), duration) })}/></label>
      {selected.kind !== 'marker' && <label>Fim <input type="number" min="0" max={duration} step="0.1" disabled={readOnly || selected.locked} value={selected.end || selected.start} onChange={event => patch(selected.id, { end: Math.max(selected.start + .1, safeTime(Number(event.target.value), duration)) })}/></label>}
      <label>Cor <input type="color" disabled={readOnly || selected.locked} value={selected.color} onChange={event => patch(selected.id, { color: event.target.value })}/></label>
      {!readOnly && <button onClick={() => setMarkers(current => current.map(item => item.id === selected.id ? { ...item, locked: !item.locked } : item))}>{selected.locked ? 'Desbloquear' : 'Bloquear'}</button>}
    </div>}
  </section>;
}
