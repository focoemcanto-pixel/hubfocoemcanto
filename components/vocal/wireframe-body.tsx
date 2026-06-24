type VocalRegion = 'chest' | 'mix' | 'head' | null;

type Props = {
  activeRegion?: VocalRegion;
  currentMidi?: number | null;
  currentLabel?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function bodyTopFromMidi(midi?: number | null) {
  if (midi == null) return 54;
  const clamped = clamp(midi, 40, 84);
  if (clamped <= 55) return 56 - ((clamped - 40) / 15) * 8;
  if (clamped <= 71) return 48 - ((clamped - 55) / 16) * 17;
  return 31 - ((clamped - 72) / 12) * 11;
}

function glowSizeFromMidi(midi?: number | null) {
  if (midi == null) return 42;
  if (midi >= 72) return 24;
  if (midi >= 55) return 38;
  return 44;
}

export function WireframeBody({ activeRegion = null, currentMidi = null, currentLabel }: Props) {
  const liveTop = bodyTopFromMidi(currentMidi);
  const liveSize = glowSizeFromMidi(currentMidi);

  return (
    <div className="wireframe-body-wrap" aria-label="Mapa corporal dos registros vocais">
      <style>{bodyCss}</style>
      <div className="body-aura" aria-hidden="true" />
      <img className="vocal-body-base" src="/vocal/vocal-body-base.png" alt="Silhueta vocal" draggable={false} />
      <div className={`body-glow-zone head ${activeRegion === 'head' ? 'is-active' : ''}`} aria-hidden="true" />
      <div className={`body-glow-zone mix ${activeRegion === 'mix' ? 'is-active' : ''}`} aria-hidden="true" />
      <div className={`body-glow-zone chest ${activeRegion === 'chest' ? 'is-active' : ''}`} aria-hidden="true" />
      <div className={`body-live-glow ${currentMidi != null ? 'is-active' : ''} ${activeRegion || ''}`} style={{ top: `${liveTop}%`, width: `${liveSize}%`, height: `${liveSize * 0.68}%` }} aria-hidden="true" />

      <div className="register-labels" aria-hidden="true">
        <span className={`register-label label-head ${activeRegion === 'head' ? 'active head' : ''}`}>Heady / Light</span>
        <span className={`register-label label-mix ${activeRegion === 'mix' ? 'active mix' : ''}`}>Mixy / Balanced</span>
        <span className={`register-label label-chest ${activeRegion === 'chest' ? 'active chest' : ''}`}>Chesty / Heavy</span>
      </div>

      <div className="body-note-badge"><small>Nota atual</small><strong>{currentLabel || '—'}</strong></div>
    </div>
  );
}

const bodyCss = `.wireframe-body-wrap{position:relative;min-height:100%;border-radius:24px;background:radial-gradient(circle at 50% 30%,rgba(103,232,249,.12),transparent 35%),radial-gradient(circle at 50% 70%,rgba(245,199,107,.08),transparent 38%),rgba(255,255,255,.025);overflow:hidden;display:grid;place-items:center;padding:4px}.body-aura{position:absolute;inset:5% 10%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(103,232,249,.12),rgba(103,232,249,.03) 42%,transparent 70%);filter:blur(10px)}.vocal-body-base{position:relative;z-index:2;width:min(100%,380px);height:min(96%,620px);object-fit:contain;object-position:center;opacity:.95;filter:drop-shadow(0 0 18px rgba(236,254,255,.18)) drop-shadow(0 0 48px rgba(103,232,249,.10));user-select:none;pointer-events:none}.body-glow-zone,.body-live-glow{position:absolute;left:50%;transform:translateX(-50%);z-index:3;opacity:0;transition:opacity .32s ease,transform .32s ease,top .22s ease,width .22s ease,height .22s ease;mix-blend-mode:screen;pointer-events:none}.body-glow-zone.is-active{opacity:.5;transform:translateX(-50%) scale(1.035)}.body-glow-zone.head{top:13%;width:25%;height:18%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(167,139,250,.95),rgba(124,58,237,.38) 38%,transparent 70%);filter:blur(7px) drop-shadow(0 0 22px rgba(167,139,250,.95))}.body-glow-zone.mix{top:21%;width:38%;height:40%;border-radius:999px;background:radial-gradient(ellipse at 50% 34%,rgba(245,199,107,.92),rgba(245,199,107,.42) 34%,rgba(103,232,249,.22) 56%,transparent 78%);filter:blur(8px) drop-shadow(0 0 24px rgba(245,199,107,.82))}.body-glow-zone.chest{top:38%;width:42%;height:22%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(103,232,249,.92),rgba(8,145,178,.36) 42%,transparent 72%);filter:blur(8px) drop-shadow(0 0 24px rgba(103,232,249,.92))}.body-live-glow{border-radius:999px;background:radial-gradient(ellipse at center,rgba(255,255,255,.96),rgba(103,232,249,.42) 34%,transparent 72%);filter:blur(6px) drop-shadow(0 0 24px rgba(103,232,249,.95));z-index:4}.body-live-glow.is-active{opacity:1}.body-live-glow.head{background:radial-gradient(ellipse at center,rgba(255,255,255,.96),rgba(167,139,250,.48) 36%,transparent 72%);filter:blur(6px) drop-shadow(0 0 24px rgba(167,139,250,.95))}.body-live-glow.mix{background:radial-gradient(ellipse at center,rgba(255,255,255,.96),rgba(245,199,107,.48) 36%,transparent 72%);filter:blur(6px) drop-shadow(0 0 24px rgba(245,199,107,.9))}.body-live-glow.chest{background:radial-gradient(ellipse at center,rgba(255,255,255,.96),rgba(103,232,249,.46) 36%,transparent 72%);filter:blur(6px) drop-shadow(0 0 24px rgba(103,232,249,.95))}.register-labels{position:absolute;inset:0;z-index:5;pointer-events:none}.register-label{position:absolute;right:7%;transform:translateY(-50%);text-align:right;font-size:11px;font-weight:950;color:rgba(255,255,255,.42);text-transform:none;letter-spacing:.08em;text-shadow:0 0 10px rgba(0,0,0,.6);white-space:nowrap}.label-head{top:23%}.label-mix{top:41%}.label-chest{top:54%}.register-label.active{color:#fff}.register-label.head{text-shadow:0 0 18px rgba(167,139,250,.95)}.register-label.mix{text-shadow:0 0 18px rgba(245,199,107,.95)}.register-label.chest{text-shadow:0 0 18px rgba(103,232,249,.95)}.body-note-badge{position:absolute;left:14px;bottom:14px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(0,0,0,.44);padding:11px 13px;display:grid;gap:2px;z-index:6;backdrop-filter:blur(10px)}.body-note-badge small{color:rgba(255,255,255,.52)!important;font-size:10px;text-transform:uppercase;letter-spacing:.12em}.body-note-badge strong{color:#67e8f9;font-size:24px;line-height:1}@media(max-width:760px){.wireframe-body-wrap{border-radius:0;background:transparent;padding:0;overflow:visible;place-items:center end}.body-aura{inset:8% -12% 8% 12%;filter:blur(18px);opacity:.7}.vocal-body-base{width:min(128%,520px);height:76dvh;object-fit:contain;object-position:right center;opacity:.72;filter:drop-shadow(0 0 24px rgba(236,254,255,.2))}.register-label{right:6%;font-size:13px;color:rgba(255,255,255,.32);letter-spacing:.06em}.label-head{top:31%}.label-mix{top:46%}.label-chest{top:61%}.body-note-badge{left:34%;bottom:7%;padding:11px 14px;border-radius:18px;background:rgba(0,0,0,.52)}.body-note-badge strong{font-size:25px}.body-glow-zone.head{top:22%;width:22%;height:14%}.body-glow-zone.mix{top:32%;width:34%;height:30%}.body-glow-zone.chest{top:49%;width:38%;height:18%}.body-live-glow{z-index:4}}`;
