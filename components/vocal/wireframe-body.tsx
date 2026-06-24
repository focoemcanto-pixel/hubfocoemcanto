type VocalRegion = 'chest' | 'mix' | 'head' | null;

type Props = {
  activeRegion?: VocalRegion;
  currentLabel?: string;
};

export function WireframeBody({ activeRegion = null, currentLabel }: Props) {
  return (
    <div className="wireframe-body-wrap" aria-label="Mapa corporal dos registros vocais">
      <style>{bodyCss}</style>
      <div className="wireframe-orbit" aria-hidden="true" />
      <svg className="wireframe-body" viewBox="0 0 260 620" role="img" aria-label="Silhueta vocal com regiões de registro">
        <defs>
          <radialGradient id="bodyGlowHead" cx="50%" cy="35%" r="60%"><stop offset="0%" stopColor="#a78bfa" stopOpacity="0.95" /><stop offset="100%" stopColor="#7c3aed" stopOpacity="0" /></radialGradient>
          <radialGradient id="bodyGlowMix" cx="50%" cy="50%" r="60%"><stop offset="0%" stopColor="#f5c76b" stopOpacity="0.95" /><stop offset="100%" stopColor="#f5c76b" stopOpacity="0" /></radialGradient>
          <radialGradient id="bodyGlowChest" cx="50%" cy="60%" r="70%"><stop offset="0%" stopColor="#67e8f9" stopOpacity="0.95" /><stop offset="100%" stopColor="#0891b2" stopOpacity="0" /></radialGradient>
          <linearGradient id="bodyStroke" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#ecfeff" stopOpacity="0.95" /><stop offset="1" stopColor="#67e8f9" stopOpacity="0.42" /></linearGradient>
        </defs>

        <ellipse className={`body-glow ${activeRegion === 'head' ? 'is-active' : ''}`} cx="130" cy="118" rx="82" ry="108" fill="url(#bodyGlowHead)" />
        <ellipse className={`body-glow ${activeRegion === 'mix' ? 'is-active' : ''}`} cx="130" cy="292" rx="104" ry="128" fill="url(#bodyGlowMix)" />
        <ellipse className={`body-glow ${activeRegion === 'chest' ? 'is-active' : ''}`} cx="130" cy="438" rx="116" ry="170" fill="url(#bodyGlowChest)" />

        <g className="body-grid" aria-hidden="true">
          <path d="M130 36 C104 130 104 500 130 594" />
          <path d="M82 90 C112 118 148 118 178 90" />
          <path d="M70 178 C98 208 162 208 190 178" />
          <path d="M42 270 C82 306 178 306 218 270" />
          <path d="M58 390 C96 430 164 430 202 390" />
          <path d="M80 512 C110 548 150 548 180 512" />
          <path d="M90 188 C70 280 78 390 106 492" />
          <path d="M170 188 C190 280 182 390 154 492" />
        </g>

        <g className="body-outline">
          <path id="head" className={`body-region ${activeRegion === 'head' ? 'region-active-head' : ''}`} d="M130 36 C168 36 192 66 190 104 C188 136 164 164 130 164 C96 164 72 136 70 104 C68 66 92 36 130 36 Z" />
          <path id="neck" className={`body-region ${activeRegion === 'head' ? 'region-active-head' : ''}`} d="M104 156 C114 188 146 188 156 156 L166 220 C150 238 110 238 94 220 Z" />
          <path id="chest" className={`body-region ${activeRegion === 'mix' ? 'region-active-mix' : ''}`} d="M68 216 C86 174 174 174 192 216 C214 270 202 360 166 406 C148 430 112 430 94 406 C58 360 46 270 68 216 Z" />
          <path id="abdomen" className={`body-region ${activeRegion === 'chest' ? 'region-active-chest' : ''}`} d="M94 404 C112 430 148 430 166 404 C188 450 180 548 154 596 C142 616 118 616 106 596 C80 548 72 450 94 404 Z" />
          <path className="body-arms" d="M68 230 C30 278 20 376 36 480 C42 520 52 552 68 588 M192 230 C230 278 240 376 224 480 C218 520 208 552 192 588" />
        </g>

        <g className="body-points" aria-hidden="true"><circle cx="130" cy="92" r="3" /><circle cx="130" cy="188" r="3" /><circle cx="130" cy="292" r="3" /><circle cx="130" cy="430" r="3" /><circle cx="130" cy="594" r="3" /></g>
      </svg>

      <div className="register-labels" aria-hidden="true">
        <span className={activeRegion === 'head' ? 'active head' : ''}>Agudo / Cabeça</span>
        <span className={activeRegion === 'mix' ? 'active mix' : ''}>Médio / Misto</span>
        <span className={activeRegion === 'chest' ? 'active chest' : ''}>Grave / Peito</span>
      </div>

      <div className="body-note-badge"><small>Nota atual</small><strong>{currentLabel || '—'}</strong></div>
    </div>
  );
}

const bodyCss = `.wireframe-body-wrap{position:relative;min-height:100%;border-radius:24px;background:radial-gradient(circle at 50% 30%,rgba(103,232,249,.12),transparent 35%),rgba(255,255,255,.025);overflow:hidden;display:grid;place-items:center;padding:6px}.wireframe-orbit{position:absolute;width:78%;aspect-ratio:1/1.75;border:1px solid rgba(103,232,249,.16);border-radius:50%;box-shadow:0 0 80px rgba(103,232,249,.14)}.wireframe-body{position:relative;z-index:1;width:min(96%,360px);height:auto;max-height:610px;overflow:visible}.body-outline .body-region,.body-outline .body-arms,.body-grid path{fill:rgba(255,255,255,.018);stroke:url(#bodyStroke);stroke-width:2.1;vector-effect:non-scaling-stroke}.body-grid path{fill:none;opacity:.32;stroke-dasharray:7 11}.body-glow{opacity:0;transition:opacity .35s ease,transform .35s ease;transform-origin:center}.body-glow.is-active{opacity:1;transform:scale(1.04)}.body-region{opacity:.34;transition:opacity .35s ease,filter .35s ease,fill .35s ease}.region-active-head,.region-active-mix,.region-active-chest{opacity:1}.region-active-head{fill:rgba(167,139,250,.12)!important;filter:drop-shadow(0 0 24px rgba(167,139,250,.98))}.region-active-mix{fill:rgba(245,199,107,.14)!important;filter:drop-shadow(0 0 24px rgba(245,199,107,.98))}.region-active-chest{fill:rgba(103,232,249,.13)!important;filter:drop-shadow(0 0 24px rgba(103,232,249,.98))}.body-points circle{fill:#67e8f9;opacity:.68;filter:drop-shadow(0 0 11px rgba(103,232,249,.8))}.register-labels{position:absolute;right:12px;top:18px;bottom:18px;display:grid;grid-template-rows:1fr 1fr 1fr;align-items:center;text-align:right;font-size:11px;font-weight:950;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:.12em;z-index:2}.register-labels span.active{color:#fff}.register-labels .head{text-shadow:0 0 18px rgba(167,139,250,.95)}.register-labels .mix{text-shadow:0 0 18px rgba(245,199,107,.95)}.register-labels .chest{text-shadow:0 0 18px rgba(103,232,249,.95)}.body-note-badge{position:absolute;left:14px;bottom:14px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(0,0,0,.42);padding:11px 13px;display:grid;gap:2px;z-index:3}.body-note-badge small{color:rgba(255,255,255,.52)!important;font-size:10px;text-transform:uppercase;letter-spacing:.12em}.body-note-badge strong{color:#67e8f9;font-size:24px;line-height:1}@media(max-width:760px){.wireframe-body-wrap{padding:2px}.wireframe-body{width:min(102%,330px);max-height:56vh}.register-labels{font-size:8px;right:7px;letter-spacing:.07em}.body-note-badge{left:8px;bottom:8px;padding:8px 10px}.body-note-badge strong{font-size:19px}}`;
