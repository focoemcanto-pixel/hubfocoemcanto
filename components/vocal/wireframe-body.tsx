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
        <span className={`register-label label-head ${activeRegion === 'head' ? 'active head' : ''}`}>Agudo / Cabeça</span>
        <span className={`register-label label-mix ${activeRegion === 'mix' ? 'active mix' : ''}`}>Médio / Misto</span>
        <span className={`register-label label-chest ${activeRegion === 'chest' ? 'active chest' : ''}`}>Grave / Peito</span>
      </div>

      <div className="body-note-badge"><small>Nota atual</small><strong>{currentLabel || '—'}</strong></div>
    </div>
  );
}

const bodyCss = `.wireframe-body-wrap{position:relative;min-height:100%;border-radius:24px;background:radial-gradient(circle at 50% 30%,rgba(103,232,249,.12),transparent 35%),radial-gradient(circle at 50% 70%,rgba(245,199,107,.08),transparent 38%),rgba(255,255,255,.025);overflow:hidden;display:grid;place-items:center;padding:4px}.body-aura{position:absolute;inset:5% 10%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(103,232,249,.12),rgba(103,232,249,.03) 42%,transparent 70%);filter:blur(10px)}.vocal-body-base{position:relative;z-index:2;width:min(100%,380px);height:min(96%,620px);object-fit:contain;object-position:center;opacity:.95;filter:drop-shadow(0 0 18px rgba(236,254,255,.18)) drop-shadow(0 0 48px rgba(103,232,249,.10));user-select:none;pointer-events:none}.body-glow-zone{position:absolute;left:50%;transform:translateX(-50%);z-index:3;opacity:0;transition:opacity .32s ease,transform .32s ease;mix-blend-mode:screen;pointer-events:none}.body-glow-zone.is-active{opacity:1;transform:translateX(-50%) scale(1.035)}.body-glow-zone.head{top:13%;width:25%;height:18%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(167,139,250,.95),rgba(124,58,237,.38) 38%,transparent 70%);filter:blur(7px) drop-shadow(0 0 22px rgba(167,139,250,.95))}.body-glow-zone.mix{top:21%;width:38%;height:40%;border-radius:999px;background:radial-gradient(ellipse at 50% 34%,rgba(245,199,107,.92),rgba(245,199,107,.42) 34%,rgba(103,232,249,.22) 56%,transparent 78%);filter:blur(8px) drop-shadow(0 0 24px rgba(245,199,107,.82))}.body-glow-zone.chest{top:38%;width:42%;height:22%;border-radius:999px;background:radial-gradient(ellipse at center,rgba(103,232,249,.92),rgba(8,145,178,.36) 42%,transparent 72%);filter:blur(8px) drop-shadow(0 0 24px rgba(103,232,249,.92))}.register-labels{position:absolute;inset:0;z-index:4;pointer-events:none}.register-label{position:absolute;right:7%;transform:translateY(-50%);text-align:right;font-size:11px;font-weight:950;color:rgba(255,255,255,.42);text-transform:uppercase;letter-spacing:.12em;text-shadow:0 0 10px rgba(0,0,0,.6);white-space:nowrap}.label-head{top:23%}.label-mix{top:41%}.label-chest{top:54%}.register-label.active{color:#fff}.register-label.head{text-shadow:0 0 18px rgba(167,139,250,.95)}.register-label.mix{text-shadow:0 0 18px rgba(245,199,107,.95)}.register-label.chest{text-shadow:0 0 18px rgba(103,232,249,.95)}.body-note-badge{position:absolute;left:14px;bottom:14px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(0,0,0,.44);padding:11px 13px;display:grid;gap:2px;z-index:5;backdrop-filter:blur(10px)}.body-note-badge small{color:rgba(255,255,255,.52)!important;font-size:10px;text-transform:uppercase;letter-spacing:.12em}.body-note-badge strong{color:#67e8f9;font-size:24px;line-height:1}@media(max-width:760px){.wireframe-body-wrap{padding:2px}.vocal-body-base{width:min(112%,360px);height:min(98%,58vh)}.register-label{right:7%;font-size:8px;letter-spacing:.07em}.label-head{top:23%}.label-mix{top:41%}.label-chest{top:54%}.body-note-badge{left:8px;bottom:8px;padding:8px 10px}.body-note-badge strong{font-size:19px}.body-glow-zone.head{top:12%;width:28%;height:18%}.body-glow-zone.mix{top:20%;width:44%;height:42%}.body-glow-zone.chest{top:38%;width:48%;height:22%}}`;
