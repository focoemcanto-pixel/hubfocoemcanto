type LogoProps = {
  className?: string;
  compact?: boolean;
};

export function FocoAcademyLogo({ className = '', compact = false }: LogoProps) {
  return (
    <span className={`foco-academy-logo ${compact ? 'compact' : ''} ${className}`} aria-label="Foco em Canto Academy">
      <svg viewBox="0 0 96 72" role="img" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="foco-academy-gold" x1="8" y1="8" x2="88" y2="66" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFE6A3" />
            <stop offset="0.44" stopColor="#D7A942" />
            <stop offset="1" stopColor="#8F6420" />
          </linearGradient>
        </defs>
        <g fill="url(#foco-academy-gold)">
          <path d="M24 48.5c-6.2 0-11.2 4-11.2 9s5 8.4 11.2 8.4 11.2-4 11.2-9V19.8h-6.8v30.1A14.7 14.7 0 0 0 24 48.5Z" />
          <path d="M47.5 40.6c-6.2 0-11.2 4-11.2 9s5 8.4 11.2 8.4 11.2-4 11.2-9V10.2h-6.9v31.7a14.7 14.7 0 0 0-4.3-1.3Z" />
          <path d="M71 32.4c-6.2 0-11.2 4-11.2 9s5 8.4 11.2 8.4 11.2-4 11.2-9V3h-6.8v30.7a14.7 14.7 0 0 0-4.4-1.3Z" />
          <path d="M28.4 18.6c8.4 1.3 15.2 1.1 23.4-1.2v6.1c-8.3 2.2-15.1 2.5-23.4 1.1v-6Z" opacity=".92" />
          <path d="M51.8 9c8.5 1.3 15.3 1 23.6-1.2v6.1c-8.3 2.2-15.2 2.5-23.6 1.1V9Z" opacity=".92" />
        </g>
      </svg>
      {!compact ? (
        <span className="foco-academy-wordmark">
          <strong>FOCO</strong>
          <small>EM CANTO</small>
          <em>ACADEMY</em>
        </span>
      ) : null}
    </span>
  );
}

export const focoAcademyLogoCss = `.foco-academy-logo{display:inline-flex;align-items:center;gap:13px;text-decoration:none;color:#fff;line-height:1}.foco-academy-logo svg{width:56px;height:48px;display:block;filter:drop-shadow(0 10px 24px rgba(215,169,66,.18))}.foco-academy-logo.compact svg{width:42px;height:34px}.foco-academy-wordmark{display:grid;gap:2px}.foco-academy-wordmark strong{font-size:24px;letter-spacing:.08em;font-weight:950;color:#fff}.foco-academy-wordmark small{font-size:11px;letter-spacing:.26em;font-weight:900;color:#d7a942}.foco-academy-wordmark em{font-style:normal;font-size:8px;letter-spacing:.42em;color:rgba(255,255,255,.54);font-weight:900}`;
