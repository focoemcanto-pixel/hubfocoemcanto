import { FocoAcademyLogo } from '@/components/foco-academy-logo';
import type { AdminSettings, BrandingAssetSize } from '@/lib/data/admin-settings';

type Props = {
  settings?: AdminSettings;
  compact?: boolean;
  className?: string;
  size?: BrandingAssetSize;
};

function logoSize(settings?: AdminSettings, compact?: boolean, override?: BrandingAssetSize): BrandingAssetSize {
  const base = override || settings?.branding?.logoSize || { width: 320, height: 96 };
  if (!compact) return {
    width: Math.max(300, base.width),
    height: Math.max(90, base.height),
  };
  return {
    width: Math.max(240, Math.round(base.width * 0.9)),
    height: Math.max(72, Math.round(base.height * 0.9)),
  };
}

export function DynamicBrandLogo({ settings, compact = false, className = '', size }: Props) {
  const logoUrl = settings?.branding?.logoUrl;
  const appName = settings?.branding?.appName || 'Foco em Canto Academy';
  const resolvedSize = logoSize(settings, compact, size);

  if (logoUrl) {
    return (
      <span className={`dynamic-brand-logo ${compact ? 'compact' : ''} ${className}`} aria-label={appName}>
        <img
          src={logoUrl}
          alt={appName}
          style={{ width: `${resolvedSize.width}px`, height: `${resolvedSize.height}px` }}
        />
      </span>
    );
  }

  return <FocoAcademyLogo compact={compact} className={className} />;
}

export const dynamicBrandLogoCss = `.dynamic-brand-logo{display:inline-flex;align-items:center;justify-content:center;line-height:1;flex:0 0 auto}.dynamic-brand-logo img{display:block;width:auto;object-fit:contain;filter:drop-shadow(0 10px 24px rgba(215,169,66,.18))}.academy-brand-lockup{min-height:110px;display:flex;align-items:center}.academy-brand-lockup .dynamic-brand-logo img{max-width:min(420px,52vw)!important}.premium-brand{min-width:280px!important;justify-content:center!important}.premium-brand .dynamic-brand-logo img{max-width:min(320px,38vw)!important}@media(max-width:760px){.academy-brand-lockup{min-height:86px}.academy-brand-lockup .dynamic-brand-logo img{max-width:min(310px,72vw)!important}.premium-brand{min-width:210px!important}.premium-brand .dynamic-brand-logo img{max-width:230px!important}}`;
