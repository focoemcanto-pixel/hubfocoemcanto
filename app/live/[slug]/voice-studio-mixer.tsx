'use client';

import { useMemo, useState } from 'react';

export type VoiceStudioMixerChannel = {
  id: string;
  name: string;
  color?: string;
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed?: boolean;
  levelLeft?: number;
  levelRight?: number;
};

type Props = {
  channels: VoiceStudioMixerChannel[];
  masterGain?: number;
  masterMuted?: boolean;
  readOnly?: boolean;
  onChannelChange?: (id: string, patch: Partial<VoiceStudioMixerChannel>) => void;
  onMasterChange?: (patch: { gain?: number; muted?: boolean }) => void;
  onClose?: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const dbLabel = (value: number) => value <= -60 ? '-∞' : `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;

function Meter({ value = -60 }: { value?: number }) {
  const height = clamp(((value + 60) / 60) * 100, 0, 100);
  return <div className="vsm-meter" aria-label={`Nível ${dbLabel(value)}`}>
    <span style={{ height: `${height}%` }} />
    <i className="vsm-meter-peak" />
  </div>;
}

function ChannelStrip({ channel, readOnly, onChange }: {
  channel: VoiceStudioMixerChannel;
  readOnly: boolean;
  onChange?: (patch: Partial<VoiceStudioMixerChannel>) => void;
}) {
  const panLabel = channel.pan === 0 ? 'C' : channel.pan < 0 ? `L${Math.abs(channel.pan)}` : `R${channel.pan}`;
  return <article className={`vsm-strip ${channel.muted ? 'muted' : ''} ${channel.solo ? 'soloed' : ''}`}>
    <header style={{ borderTopColor: channel.color || '#8b5cf6' }} title={channel.name}>
      <strong>{channel.name}</strong>
    </header>

    <div className="vsm-pan">
      <label>Pan</label>
      <input type="range" min="-100" max="100" step="1" value={channel.pan}
        disabled={readOnly}
        onChange={event => onChange?.({ pan: Number(event.target.value) })} />
      <output>{panLabel}</output>
    </div>

    <div className="vsm-body">
      <div className="vsm-meters"><Meter value={channel.levelLeft} /><Meter value={channel.levelRight} /></div>
      <div className="vsm-fader-wrap">
        <output>{dbLabel(channel.gain)}</output>
        <input className="vsm-fader" type="range" min="-60" max="12" step="0.1" value={channel.gain}
          disabled={readOnly}
          onDoubleClick={() => !readOnly && onChange?.({ gain: 0 })}
          onChange={event => onChange?.({ gain: Number(event.target.value) })} />
      </div>
    </div>

    <div className="vsm-actions">
      <button className={channel.muted ? 'active mute' : ''} disabled={readOnly} onClick={() => onChange?.({ muted: !channel.muted })}>M</button>
      <button className={channel.solo ? 'active solo' : ''} disabled={readOnly} onClick={() => onChange?.({ solo: !channel.solo })}>S</button>
      <button className={channel.armed ? 'active arm' : ''} disabled={readOnly} onClick={() => onChange?.({ armed: !channel.armed })}>R</button>
    </div>
  </article>;
}

export default function VoiceStudioMixer({
  channels,
  masterGain = 0,
  masterMuted = false,
  readOnly = false,
  onChannelChange,
  onMasterChange,
  onClose,
}: Props) {
  const [compact, setCompact] = useState(false);
  const soloCount = useMemo(() => channels.filter(channel => channel.solo).length, [channels]);

  return <section className={`voice-studio-mixer ${compact ? 'compact' : ''}`}>
    <style>{`
      .voice-studio-mixer{--line:#2b303b;--panel:#151922;--panel2:#1b202a;background:var(--panel);color:#e7eaf0;border-top:1px solid var(--line);font-size:12px;min-height:300px;display:flex;flex-direction:column}
      .voice-studio-mixer>header{height:44px;display:flex;align-items:center;gap:9px;padding:0 12px;border-bottom:1px solid var(--line);background:#12161e}
      .voice-studio-mixer>header strong{font-size:13px;margin-right:auto}.voice-studio-mixer>header small{color:#9098a7}.voice-studio-mixer button{height:29px;min-width:30px;border:1px solid #363c49;border-radius:7px;background:#202631;color:#dfe3ea;cursor:pointer}.voice-studio-mixer button:hover:not(:disabled){background:#2a3140}.voice-studio-mixer button:disabled{opacity:.5;cursor:default}
      .vsm-console{display:flex;align-items:stretch;gap:6px;padding:10px;overflow-x:auto;min-height:255px}.vsm-strip{width:116px;min-width:116px;border:1px solid var(--line);border-radius:10px;background:linear-gradient(#1b202a,#141820);overflow:hidden;box-shadow:0 5px 14px rgba(0,0,0,.18)}
      .vsm-strip>header{height:39px;border-top:4px solid #8b5cf6;padding:0 8px;display:flex;align-items:center;border-bottom:1px solid var(--line)}.vsm-strip>header strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}.vsm-pan{padding:7px;border-bottom:1px solid var(--line);text-align:center}.vsm-pan label{display:block;color:#8f98a8;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.vsm-pan input{width:100%;height:15px}.vsm-pan output{display:block;color:#cbd1dc;font-variant-numeric:tabular-nums}
      .vsm-body{height:137px;display:flex;justify-content:center;gap:8px;padding:8px 7px}.vsm-meters{display:flex;gap:2px}.vsm-meter{position:relative;width:7px;height:112px;background:#090c11;border:1px solid #303642;border-radius:3px;overflow:hidden;display:flex;align-items:flex-end}.vsm-meter span{display:block;width:100%;background:linear-gradient(to top,#22c55e 0 64%,#eab308 64% 86%,#ef4444 86%);transition:height 70ms linear}.vsm-meter-peak{position:absolute;left:0;right:0;top:5px;height:1px;background:#ef4444;opacity:.75}
      .vsm-fader-wrap{width:53px;text-align:center}.vsm-fader-wrap output{display:block;height:20px;font-size:9px;font-variant-numeric:tabular-nums;color:#aeb6c4}.vsm-fader{writing-mode:vertical-lr;direction:rtl;width:28px;height:96px;accent-color:#8b5cf6}.vsm-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:7px;border-top:1px solid var(--line)}.vsm-actions button{min-width:0;padding:0;font-weight:800}.vsm-actions .mute{color:#111;background:#f5c542}.vsm-actions .solo{color:#111;background:#63d5ff}.vsm-actions .arm{color:#fff;background:#e5484d}
      .vsm-strip.muted{opacity:.67}.vsm-strip.soloed{box-shadow:0 0 0 1px #63d5ff,0 0 18px rgba(99,213,255,.15)}
      .vsm-master{width:132px;min-width:132px;border:1px solid #444b5a;border-radius:10px;background:linear-gradient(#242a35,#151922);overflow:hidden;margin-left:5px}.vsm-master>header{height:43px;display:flex;align-items:center;justify-content:center;border-top:4px solid #f3f4f6;border-bottom:1px solid var(--line);letter-spacing:.13em}.vsm-master .vsm-body{height:167px}.vsm-master .vsm-meter{height:142px}.vsm-master .vsm-fader{height:126px}.vsm-master footer{padding:7px;border-top:1px solid var(--line)}.vsm-master footer button{width:100%}.vsm-master footer button.active{background:#f5c542;color:#111}
      .voice-studio-mixer.compact{min-height:0}.voice-studio-mixer.compact .vsm-console{min-height:0}.voice-studio-mixer.compact .vsm-pan,.voice-studio-mixer.compact .vsm-body{display:none}.voice-studio-mixer.compact .vsm-strip,.voice-studio-mixer.compact .vsm-master{height:auto}
      @media(max-width:720px){.vsm-console{padding:7px}.vsm-strip{width:104px;min-width:104px}.voice-studio-mixer>header small{display:none}}
    `}</style>

    <header>
      <strong>Mixer</strong>
      <small>{channels.length} canais{soloCount ? ` · ${soloCount} em solo` : ''}</small>
      <button onClick={() => setCompact(value => !value)} title={compact ? 'Expandir mixer' : 'Compactar mixer'}>{compact ? '↕' : '—'}</button>
      {onClose && <button onClick={onClose} title="Fechar mixer">×</button>}
    </header>

    <div className="vsm-console">
      {channels.map(channel => <ChannelStrip key={channel.id} channel={channel} readOnly={readOnly}
        onChange={patch => onChannelChange?.(channel.id, patch)} />)}

      {!channels.length && <div style={{ minWidth: 220, padding: 20, color: '#8f98a8' }}>
        As tracks do projeto aparecerão aqui quando o Mixer for conectado ao runtime.
      </div>}

      <article className="vsm-master">
        <header><strong>MASTER</strong></header>
        <div className="vsm-body">
          <div className="vsm-meters"><Meter value={-60} /><Meter value={-60} /></div>
          <div className="vsm-fader-wrap">
            <output>{dbLabel(masterGain)}</output>
            <input className="vsm-fader" type="range" min="-60" max="12" step="0.1" value={masterGain}
              disabled={readOnly}
              onDoubleClick={() => !readOnly && onMasterChange?.({ gain: 0 })}
              onChange={event => onMasterChange?.({ gain: Number(event.target.value) })} />
          </div>
        </div>
        <footer><button className={masterMuted ? 'active' : ''} disabled={readOnly} onClick={() => onMasterChange?.({ muted: !masterMuted })}>MUTE MASTER</button></footer>
      </article>
    </div>
  </section>;
}
