type VocalRegion = 'chest' | 'mix' | 'head' | null;

type Props = {
  activeRegion?: VocalRegion;
  currentLabel?: string;
};

export function WireframeBody({ activeRegion = null, currentLabel }: Props) {
  return (
    <div className="wireframe-body-wrap" aria-label="Mapa corporal dos registros vocais">
      <div className="wireframe-orbit" aria-hidden="true" />
      <svg className="wireframe-body" viewBox="0 0 220 520" role="img" aria-label="Silhueta vocal com regiões de registro">
        <defs>
          <radialGradient id="bodyGlowHead" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#7c3aed" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bodyGlowMix" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#f5c76b" stopOpacity="0.95" />
            <stop offset="58%" stopColor="#f5c76b" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f5c76b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bodyGlowChest" cx="50%" cy="60%" r="70%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#0891b2" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bodyStroke" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#e0faff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#67e8f9" stopOpacity="0.38" />
          </linearGradient>
        </defs>

        <ellipse className={`body-glow body-glow-head ${activeRegion === 'head' ? 'is-active' : ''}`} cx="110" cy="105" rx="68" ry="86" fill="url(#bodyGlowHead)" />
        <ellipse className={`body-glow body-glow-mix ${activeRegion === 'mix' ? 'is-active' : ''}`} cx="110" cy="255" rx="80" ry="92" fill="url(#bodyGlowMix)" />
        <ellipse className={`body-glow body-glow-chest ${activeRegion === 'chest' ? 'is-active' : ''}`} cx="110" cy="360" rx="86" ry="120" fill="url(#bodyGlowChest)" />

        <g className="body-grid" opacity="0.25">
          <path d="M110 40 C92 96 92 410 110 486" />
          <path d="M70 82 C95 118 125 118 150 82" />
          <path d="M42 220 C74 246 146 246 178 220" />
          <path d="M50 332 C84 360 136 360 170 332" />
          <path d="M62 438 C88 462 132 462 158 438" />
        </g>

        <g className="body-outline">
          <circle id="head" className={`body-region region-head ${activeRegion === 'head' ? 'region-active-head' : ''}`} cx="110" cy="78" r="45" />
          <path id="neck" className={`body-region region-head ${activeRegion === 'head' ? 'region-active-head' : ''}`} d="M88 122 C95 146 125 146 132 122 L140 170 C126 184 94 184 80 170 Z" />
          <path id="chest" className={`body-region region-mix ${activeRegion === 'mix' ? 'region-active-mix' : ''}`} d="M58 180 C72 150 148 150 162 180 C178 214 172 292 144 328 C130 346 90 346 76 328 C48 292 42 214 58 180 Z" />
          <path id="abdomen" className={`body-region region-chest ${activeRegion === 'chest' ? 'region-active-chest' : ''}`} d="M78 328 C92 350 128 350 142 328 C160 362 154 432 132 472 C124 488 96 488 88 472 C66 432 60 362 78 328 Z" />
          <path className="body-arms" d="M58 190 C36 228 28 292 34 352 M162 190 C184 228 192 292 186 352" />
        </g>

        <g className="body-points" aria-hidden="true">
          <circle cx="110" cy="78" r="3" />
          <circle cx="110" cy="172" r="3" />
          <circle cx="110" cy="255" r="3" />
          <circle cx="110" cy="360" r="3" />
          <circle cx="110" cy="470" r="3" />
        </g>
      </svg>

      <div className="register-labels" aria-hidden="true">
        <span className={activeRegion === 'head' ? 'active' : ''}>Agudo / Cabeça</span>
        <span className={activeRegion === 'mix' ? 'active' : ''}>Médio / Misto</span>
        <span className={activeRegion === 'chest' ? 'active' : ''}>Grave / Peito</span>
      </div>

      <div className="body-note-badge">
        <small>Nota atual</small>
        <strong>{currentLabel || '—'}</strong>
      </div>
    </div>
  );
}
