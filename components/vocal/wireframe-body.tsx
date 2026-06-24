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
  if (midi == null) return 47;
  const clamped = clamp(midi, 40, 84);
  if (clamped <= 55) return 50 - ((clamped - 40) / 15) * 6;
  if (clamped <= 71) return 36 - ((clamped - 55) / 16) * 11;
  return 20 - ((clamped - 72) / 12) * 3;
}

function glowSizeFromMidi(midi?: number | null) {
  if (midi == null) return 32;
  if (midi >= 72) return 20;
  if (midi >= 55) return 27;
  return 34;
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
        <span className={`register-label label-head ${activeRegion === 'head' ? 'active head' : ''}`}>Cabeça</span>
        <span className={`register-label label-mix ${activeRegion === 'mix' ? 'active mix' : ''}`}>Voz mista</span>
        <span className={`register-label label-chest ${activeRegion === 'chest' ? 'active chest' : ''}`}>Peito</span>
      </div>

      <div className="body-note-badge"><small>Nota atual</small><strong>{currentLabel || '—'}</strong></div>
    </div>
  );
}

const bodyCss = `.wireframe-body-wrap{position:relative;min-height:100%;border-radius:24px;background:radial-gradient(circle at 50% 30%,rgba(103,232,249,.12),transparent 35%),radial-gradient(circle at 50% 70%,rgba(245,199,107,.08),transparent 38%),rgba(255,255,255,.025);overflow:hidden;display:grid;place-items:center;padding:4px}.body-aura{position:absolute;inset:5% 10%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(103,232,249,.12),rgba(103,232,249,.03) 42%,transparent 70%);filter:blur(10px)}.vocal-body-base{position:relative;z-index:2;width:min(100%,380px);height:min(96%,620px);object-fit:contain;object-position:center;opacity:.95;filter:drop-shadow(0 0 18px rgba(236,254,255,.18)) drop-shadow(0 0 48px rgba(103,232,249,.10));user-select:none;pointer-events:none}.body-glow-zone,.body-live-glow{position:absolute;left:50%;transform:translateX(-50%);z-index:3;opacity:0;transition:opacity .32s ease,transform .32s ease,top .22s ease,width .22s ease,height .22s ease;mix-blend-mode:screen;pointer-events:none}.body-glow-zone.is-active{opacity:.42;transform:translateX(-50%) scale(1.02)}.body-glow-zone.head{top:14%;width:18%;height:11%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(167,139,250,.92),rgba(124,58,237,.34) 38%,transparent 70%);filter:blur(7px) drop-shadow(0 0 22px rgba(167,139,250,.88))}.body-glow-zone.mix{top:25%;width:24%;height:17%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(103,232,249,.86),rgba(103,232,249,.32) 48%,transparent 74%);filter:blur(8px) drop-shadow(0 0 22px rgba(103,232,249,.72))}.body-glow-zone.chest{top:39%;width:26%;height:14%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(245,199,107,.86),rgba(245,199,107,.34) 48%,transparent 74%);filter:blur(8px) drop-shadow(0 0 22px rgba(245,199,107,.76))}.body-live-glow{border-radius:999px;background:radial-gradient(ellipse at center,rgba(255,255,255,.92),rgba(103,232,249,.38) 34%,transparent 72%);filter:blur(6px) drop-shadow(0 0 22px rgba(103,232,249,.88));z-index:4}.body-live-glow.is-active{opacity:1}.body-live-glow.head{background:radial-gradient(ellipse at center,rgba(255,255,255,.92),rgba(167,139,250,.46) 36%,transparent 72%);filter:blur(6px) drop-shadow(0 0 22px rgba(167,139,250,.9))}.body-live-glow.mix{background:radial-gradient(ellipse at center,rgba(255,255,255,.92),rgba(103,232,249,.48) 36%,transparent 72%);filter:blur(6px) drop-shadow(0 0 22px rgba(103,232,249,.86))}.body-live-glow.chest{background:radial-gradient(ellipse at center,rgba(255,255,255,.92),rgba(245,199,107,.46) 36%,transparent 72%);filter:blur(6px) drop-shadow(0 0 22px rgba(245,199,107,.86))}.register-labels{position:absolute;inset:0;z-index:5;pointer-events:none}.register-label{position:absolute;right:7%;transform:translateY(-50%);font-size:11px;font-weight:950;color:rgba(255,255,255,.58);text-transform:uppercase;letter-spacing:.05em;text-shadow:0 0 10px rgba(0,0,0,.6);white-space:nowrap}.label-head{top:20%}.label-mix{top:34%}.label-chest{top:48%}.register-label.active{color:#fff}.register-label.head{text-shadow:0 0 18px rgba(167,139,250,.95)}.register-label.mix{text-shadow:0 0 18px rgba(103,232,249,.95)}.register-label.chest{color:#f5c76b;text-shadow:0 0 18px rgba(245,199,107,.95)}.body-note-badge{position:absolute;left:14px;bottom:14px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(0,0,0,.44);padding:11px 13px;display:grid;gap:2px;z-index:6;backdrop-filter:blur(10px)}.body-note-badge small{color:rgba(255,255,255,.52)!important;font-size:10px;text-transform:uppercase;letter-spacing:.12em}.body-note-badge strong{color:#67e8f9;font-size:24px;line-height:1}@media(max-width:760px){.wireframe-body-wrap{position:absolute;inset:0;border-radius:0;background:transparent;padding:0;overflow:visible;place-items:center end}.body-aura{inset:18% -8% 15% 28%;filter:blur(18px);opacity:.55}.vocal-body-base{position:absolute;right:-23%;top:21dvh;width:112vw;height:58dvh;object-fit:contain;object-position:right top;opacity:.72;mix-blend-mode:screen;filter:drop-shadow(0 0 24px rgba(236,254,255,.16));z-index:2}.register-label{right:5%;font-size:13px;color:rgba(255,255,255,.5);letter-spacing:.04em}.label-head{top:29%}.label-mix{top:39%}.label-chest{top:50%}.body-note-badge{left:50%;transform:translateX(-28%);bottom:18.5dvh;padding:10px 14px;border-radius:18px;background:rgba(0,0,0,.52);z-index:8;text-align:center}.body-note-badge strong{font-size:34px}.body-note-badge small{font-size:11px}.body-glow-zone,.body-live-glow{left:64%}.body-glow-zone.head{top:24%;width:12%;height:7%}.body-glow-zone.mix{top:34%;width:16%;height:10%}.body-glow-zone.chest{top:46%;width:22%;height:12%}.body-live-glow{z-index:4;max-width:22%;max-height:12%;left:64%}.body-live-glow.chest{filter:blur(7px) drop-shadow(0 0 28px rgba(245,199,107,.9))}}`;
