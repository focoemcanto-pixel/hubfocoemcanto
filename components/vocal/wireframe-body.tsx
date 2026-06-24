type VocalRegion = 'chest' | 'mix' | 'head' | null;

type Props = {
  activeRegion?: VocalRegion;
  currentLabel?: string;
};

export function WireframeBody({ activeRegion = null, currentLabel }: Props) {
  return (
    <div className="wireframe-body-wrap" aria-label="Mapa corporal dos registros vocais">
      <style>{bodyCss}</style>
      <div className="body-aura" aria-hidden="true" />
      <img className="vocal-body-base" src="/vocal/vocal-body-base.png" alt="Silhueta vocal" draggable={false} />
      <div className={`body-glow-zone head ${activeRegion === 'head' ? 'is-active' : ''}`} aria-hidden="true" />
      <div className={`body-glow-zone mix ${activeRegion === 'mix' ? 'is-active' : ''}`} aria-hidden="true" />
      <div className={`body-glow-zone chest ${activeRegion === 'chest' ? 'is-active' : ''}`} aria-hidden="true" />

      <div className="register-labels" aria-hidden="true">
        <span className={activeRegion === 'head' ? 'active head' : ''}>Agudo / Cabeça</span>
        <span className={activeRegion === 'mix' ? 'active mix' : ''}>Médio / Misto</span>
        <span className={activeRegion === 'chest' ? 'active chest' : ''}>Grave / Peito</span>
      </div>

      <div className="body-note-badge"><small>Nota atual</small><strong>{currentLabel || '—'}</strong></div>
    </div>
  );
}

const bodyCss = `.wireframe-body-wrap{position:relative;min-height:100%;border-radius:24px;background:radial-gradient(circle at 50% 30%,rgba(103,232,249,.12),transparent 35%),radial-gradient(circle at 50% 70%,rgba(245,199,107,.08),transparent 38%),rgba(255,255,255,.025);overflow:hidden;display:grid;place-items:center;padding:4px}.body-aura{position:absolute;inset:5% 10%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(103,232,249,.12),rgba(103,232,249,.03) 42%,transparent 70%);filter:blur(10px)}.vocal-body-base{position:relative;z-index:2;width:min(100%,380px);height:min(96%,620px);object-fit:contain;object-position:center;opacity:.95;filter:drop-shadow(0 0 18px rgba(236,254,255,.18)) drop-shadow(0 0 48px rgba(103,232,249,.10));user-select:none;pointer-events:none}.body-glow-zone{position:absolute;left:50%;transform:translateX(-50%);z-index:3;opacity:0;transition:opacity .32s ease,transform .32s ease;mix-blend-mode:screen;pointer-events:none}.body-glow-zone.is-active{opacity:1;transform:translateX(-50%) scale(1.04)}.body-glow-zone.head{top:10%;width:34%;height:26%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(167,139,250,.95),rgba(124,58,237,.34) 42%,transparent 72%);filter:blur(8px) drop-shadow(0 0 24px rgba(167,139,250,.95))}.body-glow-zone.mix{top:36%;width:42%;height:26%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(245,199,107,.95),rgba(245,199,107,.34) 42%,transparent 72%);filter:blur(8px) drop-shadow(0 0 24px rgba(245,199,107,.95))}.body-glow-zone.chest{top:50%;width:44%;height:30%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(103,232,249,.95),rgba(8,145,178,.34) 44%,transparent 74%);filter:blur(9px) drop-shadow(0 0 24px rgba(103,232,249,.95))}.register-labels{position:absolute;right:12px;top:18px;bottom:18px;display:grid;grid-template-rows:1fr 1fr 1fr;align-items:center;text-align:right;font-size:11px;font-weight:950;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:.12em;z-index:4}.register-labels span.active{color:#fff}.register-labels .head{text-shadow:0 0 18px rgba(167,139,250,.95)}.register-labels .mix{text-shadow:0 0 18px rgba(245,199,107,.95)}.register-labels .chest{text-shadow:0 0 18px rgba(103,232,249,.95)}.body-note-badge{position:absolute;left:14px;bottom:14px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(0,0,0,.44);padding:11px 13px;display:grid;gap:2px;z-index:5;backdrop-filter:blur(10px)}.body-note-badge small{color:rgba(255,255,255,.52)!important;font-size:10px;text-transform:uppercase;letter-spacing:.12em}.body-note-badge strong{color:#67e8f9;font-size:24px;line-height:1}@media(max-width:760px){.wireframe-body-wrap{padding:2px}.vocal-body-base{width:min(112%,360px);height:min(98%,58vh)}.register-labels{font-size:8px;right:7px;letter-spacing:.07em}.body-note-badge{left:8px;bottom:8px;padding:8px 10px}.body-note-badge strong{font-size:19px}.body-glow-zone.head{top:8%;width:40%;height:27%}.body-glow-zone.mix{top:34%;width:50%;height:27%}.body-glow-zone.chest{top:49%;width:52%;height:32%}}`;
