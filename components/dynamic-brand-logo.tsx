import { FocoAcademyLogo } from '@/components/foco-academy-logo';
import type { AdminSettings, BrandingAssetSize } from '@/lib/data/admin-settings';

type Props = {
  settings?: AdminSettings;
  compact?: boolean;
  className?: string;
  size?: BrandingAssetSize;
};

function logoSize(settings?: AdminSettings, compact?: boolean, override?: BrandingAssetSize): BrandingAssetSize {
  const base = override || settings?.branding?.logoSize || { width: 260, height: 78 };
  if (!compact) return base;
  return {
    width: Math.max(80, Math.round(base.width * 0.82)),
    height: Math.max(28, Math.round(base.height * 0.82)),
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

export const dynamicBrandLogoCss = `.dynamic-brand-logo{display:inline-flex;align-items:center;justify-content:center;line-height:1}.dynamic-brand-logo img{display:block;max-width:min(340px,42vw);object-fit:contain;filter:drop-shadow(0 10px 24px rgba(215,169,66,.18))}.academy-brand-lockup .dynamic-brand-logo img{max-width:min(360px,46vw)}.premium-brand .dynamic-brand-logo img{max-width:min(230px,34vw)}@media(max-width:760px){.dynamic-brand-logo img{max-width:min(260px,54vw)}.premium-brand .dynamic-brand-logo img{max-width:190px}}`;
