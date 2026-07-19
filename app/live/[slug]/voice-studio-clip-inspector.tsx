'use client';

import { useEffect, useMemo, useState } from 'react';

export type VoiceStudioInspectorClip = {
  id: string;
  name: string;
  trackId: string;
  assetId: string;
  start: number;
  duration: number;
  offset?: number;
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
  playbackRate?: number;
  muted?: boolean;
  locked?: boolean;
  color?: string;
  groupId?: string | null;
};

type Props = {
  clip: VoiceStudioInspectorClip | null;
  projectDuration?: number;
  readOnly?: boolean;
  onChange?: (clipId: string, patch: Partial<VoiceStudioInspectorClip>) => void;
  onDuplicate?: (clipId: string) => void;
  onDelete?: (clipId: string) => void;
  onSelectAsset?: (assetId: string) => void;
  onClose?: () => void;
};

const DEFAULT_COLOR = '#8b5cf6';

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds || 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.01,
  suffix,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  function commit() {
    const next = clamp(Number(draft), min, max);
    setDraft(String(next));
    onCommit(next);
  }

  return <label className="vs-inspector-field">
    <span>{label}</span>
    <div className="vs-inspector-number">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
          if (event.key === 'Escape') {
            setDraft(String(value));
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
      {suffix && <small>{suffix}</small>}
    </div>
  </label>;
}

export default function VoiceStudioClipInspector({
  clip,
  projectDuration = Number.MAX_SAFE_INTEGER,
  readOnly = false,
  onChange,
  onDuplicate,
  onDelete,
  onSelectAsset,
  onClose,
}: Props) {
  const end = useMemo(() => clip ? clip.start + clip.duration : 0, [clip]);

  function patch(value: Partial<VoiceStudioInspectorClip>) {
    if (!clip || readOnly || clip.locked) return;
    onChange?.(clip.id, value);
  }

  if (!clip) {
    return <aside className="vs-clip-inspector empty" aria-label="Inspector do clip">
      <style>{INSPECTOR_STYLES}</style>
      <div className="vs-inspector-empty-icon">◇</div>
      <strong>Nenhum clip selecionado</strong>
      <p>Selecione um clip na timeline para editar posição, duração, fades, ganho e propriedades.</p>
    </aside>;
  }

  const locked = Boolean(readOnly || clip.locked);
  const maxStart = Math.max(0, projectDuration - Math.max(.01, clip.duration));
  const maxDuration = Math.max(.01, projectDuration - clip.start);

  return <aside className="vs-clip-inspector" aria-label={`Inspector de ${clip.name}`}>
    <style>{INSPECTOR_STYLES}</style>

    <header>
      <div>
        <small>INSPECTOR</small>
        <strong>{clip.name || 'Clip sem nome'}</strong>
      </div>
      {onClose && <button className="vs-inspector-icon" onClick={onClose} title="Fechar inspector">×</button>}
    </header>

    <section className="vs-inspector-summary">
      <div className="vs-inspector-color" style={{ background: clip.color || DEFAULT_COLOR }} />
      <div><span>Início</span><b>{formatTime(clip.start)}</b></div>
      <div><span>Fim</span><b>{formatTime(end)}</b></div>
      <div><span>Duração</span><b>{formatTime(clip.duration)}</b></div>
    </section>

    <section>
      <h3>Identificação</h3>
      <label className="vs-inspector-field wide">
        <span>Nome</span>
        <input
          value={clip.name}
          disabled={locked}
          onChange={event => patch({ name: event.target.value })}
        />
      </label>
      <div className="vs-inspector-grid two">
        <label className="vs-inspector-field">
          <span>Cor</span>
          <input type="color" disabled={locked} value={clip.color || DEFAULT_COLOR} onChange={event => patch({ color: event.target.value })} />
        </label>
        <label className="vs-inspector-field">
          <span>Asset</span>
          <button className="vs-inspector-asset" onClick={() => onSelectAsset?.(clip.assetId)} title={clip.assetId}>Abrir asset</button>
        </label>
      </div>
    </section>

    <section>
      <h3>Posição e tempo</h3>
      <div className="vs-inspector-grid two">
        <NumberField label="Início" value={clip.start} min={0} max={maxStart} disabled={locked} onCommit={start => patch({ start })} suffix="s" />
        <NumberField label="Duração" value={clip.duration} min={.01} max={maxDuration} disabled={locked} onCommit={duration => patch({ duration })} suffix="s" />
        <NumberField label="Offset" value={clip.offset || 0} min={0} max={Number.MAX_SAFE_INTEGER} disabled={locked} onCommit={offset => patch({ offset })} suffix="s" />
        <NumberField label="Velocidade" value={clip.playbackRate || 1} min={.25} max={4} step={.01} disabled={locked} onCommit={playbackRate => patch({ playbackRate })} suffix="×" />
      </div>
    </section>

    <section>
      <h3>Áudio</h3>
      <div className="vs-inspector-grid two">
        <NumberField label="Ganho" value={clip.gain ?? 1} min={0} max={2} step={.01} disabled={locked} onCommit={gain => patch({ gain })} suffix="×" />
        <NumberField label="Fade In" value={clip.fadeIn || 0} min={0} max={clip.duration} disabled={locked} onCommit={fadeIn => patch({ fadeIn: Math.min(fadeIn, clip.duration - (clip.fadeOut || 0)) })} suffix="s" />
        <NumberField label="Fade Out" value={clip.fadeOut || 0} min={0} max={clip.duration} disabled={locked} onCommit={fadeOut => patch({ fadeOut: Math.min(fadeOut, clip.duration - (clip.fadeIn || 0)) })} suffix="s" />
      </div>
    </section>

    <section>
      <h3>Estado</h3>
      <div className="vs-inspector-switches">
        <button className={clip.muted ? 'active danger' : ''} disabled={readOnly} onClick={() => onChange?.(clip.id, { muted: !clip.muted })}>
          <span>Mute Clip</span><i />
        </button>
        <button className={clip.locked ? 'active' : ''} disabled={readOnly} onClick={() => onChange?.(clip.id, { locked: !clip.locked })}>
          <span>Lock Clip</span><i />
        </button>
      </div>
      {clip.groupId && <div className="vs-inspector-group">Grupo: <code>{clip.groupId}</code></div>}
    </section>

    <footer>
      <button onClick={() => onDuplicate?.(clip.id)}>Duplicar</button>
      <button className="danger" onClick={() => onDelete?.(clip.id)} disabled={readOnly || clip.locked}>Excluir</button>
    </footer>
  </aside>;
}

const INSPECTOR_STYLES = `
  .vs-clip-inspector{width:300px;min-width:280px;height:100%;overflow:auto;background:#12161e;border-left:1px solid #2a303d;color:#e8eaf0;font:12px/1.4 Inter,system-ui,sans-serif}
  .vs-clip-inspector.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;color:#8f97a8}
  .vs-clip-inspector.empty strong{color:#d8dce5;font-size:14px}.vs-clip-inspector.empty p{max-width:220px}.vs-inspector-empty-icon{font-size:38px;color:#6d7484;margin-bottom:8px}
  .vs-clip-inspector>header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:14px 14px 12px;background:rgba(18,22,30,.96);backdrop-filter:blur(10px);border-bottom:1px solid #282e3a}
  .vs-clip-inspector>header div{min-width:0}.vs-clip-inspector>header small{display:block;color:#737c90;font-size:9px;font-weight:800;letter-spacing:.18em}.vs-clip-inspector>header strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
  .vs-inspector-icon{width:28px;height:28px;border:1px solid #353c4a;border-radius:7px;background:#1b202a;color:#bbc1ce;cursor:pointer}
  .vs-inspector-summary{display:grid!important;grid-template-columns:8px repeat(3,1fr);gap:8px;align-items:center;background:#171c25}.vs-inspector-summary>div:not(.vs-inspector-color){min-width:0}.vs-inspector-summary span{display:block;color:#778094;font-size:9px;text-transform:uppercase}.vs-inspector-summary b{font-size:10px;white-space:nowrap}.vs-inspector-color{width:8px;height:38px;border-radius:5px}
  .vs-clip-inspector>section{display:block;padding:12px 14px;border-bottom:1px solid #242a35}.vs-clip-inspector h3{margin:0 0 10px;color:#8f98aa;font-size:10px;text-transform:uppercase;letter-spacing:.12em}
  .vs-inspector-grid{display:grid;gap:9px}.vs-inspector-grid.two{grid-template-columns:1fr 1fr}.vs-inspector-field{display:flex;flex-direction:column;gap:5px;min-width:0}.vs-inspector-field.wide{margin-bottom:9px}.vs-inspector-field>span{color:#858da0;font-size:10px}
  .vs-inspector-field input,.vs-inspector-field button{width:100%;height:32px;box-sizing:border-box;border:1px solid #343b49;border-radius:7px;background:#1a1f29;color:#edf0f5;padding:0 8px;outline:none}.vs-inspector-field input:focus{border-color:#7c5cff;box-shadow:0 0 0 2px rgba(124,92,255,.15)}.vs-inspector-field input:disabled{opacity:.55}
  .vs-inspector-number{position:relative}.vs-inspector-number input{padding-right:28px}.vs-inspector-number small{position:absolute;right:8px;top:8px;color:#697286;pointer-events:none}
  .vs-inspector-asset{cursor:pointer;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vs-inspector-switches{display:grid;grid-template-columns:1fr 1fr;gap:8px}.vs-inspector-switches button{display:flex;align-items:center;justify-content:space-between;height:34px;border:1px solid #353c49;border-radius:8px;background:#1a1f28;color:#cdd2dc;padding:0 9px;cursor:pointer}.vs-inspector-switches button i{width:24px;height:14px;border-radius:9px;background:#3b4250;position:relative}.vs-inspector-switches button i:after{content:'';position:absolute;left:2px;top:2px;width:10px;height:10px;border-radius:50%;background:#aeb5c2;transition:.16s}.vs-inspector-switches button.active{border-color:#7557e8;background:rgba(117,87,232,.13)}.vs-inspector-switches button.active i{background:#7557e8}.vs-inspector-switches button.active i:after{left:12px;background:#fff}.vs-inspector-switches button.danger{border-color:#a34855;background:rgba(163,72,85,.12)}
  .vs-inspector-group{margin-top:9px;color:#8790a2}.vs-inspector-group code{color:#c6cbd5}
  .vs-clip-inspector>footer{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 14px;background:rgba(18,22,30,.96);backdrop-filter:blur(10px);border-top:1px solid #29303b}.vs-clip-inspector>footer button{height:34px;border:1px solid #3b4250;border-radius:8px;background:#202632;color:#e6e9ef;cursor:pointer}.vs-clip-inspector>footer button.danger{border-color:#75404a;color:#ffb7c0;background:#26191d}.vs-clip-inspector button:disabled{opacity:.45;cursor:not-allowed}
  @media(max-width:900px){.vs-clip-inspector{width:100%;min-width:0;max-height:46vh;border-left:0;border-top:1px solid #2a303d}.vs-inspector-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
