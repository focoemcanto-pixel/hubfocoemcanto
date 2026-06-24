import { FocoAcademyLogo } from '@/components/foco-academy-logo';
import type { AdminSettings } from '@/lib/data/admin-settings';

type Props = {
  settings?: AdminSettings;
  compact?: boolean;
  className?: string;
};

export function DynamicBrandLogo({ settings, compact = false, className = '' }: Props) {
  const logoUrl = settings?.branding?.logoUrl;
  const appName = settings?.branding?.appName || 'Foco em Canto Academy';

  if (logoUrl) {
    return (
      <span className={`dynamic-brand-logo ${compact ? 'compact' : ''} ${className}`} aria-label={appName}>
        <img src={logoUrl} alt={appName} />
      </span>
    );
  }

  return <FocoAcademyLogo compact={compact} className={className} />;
}

export const dynamicBrandLogoCss = `.dynamic-brand-logo{display:inline-flex;align-items:center;justify-content:center;line-height:1}.dynamic-brand-logo img{display:block;width:auto;height:58px;max-width:230px;object-fit:contain;filter:drop-shadow(0 10px 24px rgba(215,169,66,.18))}.dynamic-brand-logo.compact img{height:42px;max-width:170px}@media(max-width:760px){.dynamic-brand-logo img{height:48px;max-width:190px}.dynamic-brand-logo.compact img{height:38px;max-width:150px}}`;
