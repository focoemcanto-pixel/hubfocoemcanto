import { getAdminSettings } from '@/lib/data/admin-settings';

const FALLBACK_URL = 'https://escola.focoemcanto.com';
const FALLBACK_DESC = 'Plataforma premium de treinamento vocal com comunidade, duetos, exercícios guiados e evolução para cantores.';

function abs(value?: string, base = FALLBACK_URL) {
  try { return value ? new URL(value, base).toString() : ''; } catch { return ''; }
}

export default async function Head() {
  const settings = await getAdminSettings();
  const b = settings.branding as any;
  const siteUrl = abs(b.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_URL) || FALLBACK_URL;
  const name = b.siteName || b.appName || 'Foco em Canto Academy';
  const title = b.seoTitle || name;
  const description = b.seoDescription || FALLBACK_DESC;
  const image = abs(b.ogImageUrl || b.heroImageUrl || b.loginImageUrl || b.logoUrl, siteUrl);
  const icon = abs(b.faviconUrl || b.logoUrl, siteUrl);
  return <>
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta name="keywords" content={b.seoKeywords || 'canto, técnica vocal, treinamento vocal, Foco em Canto'} />
    <meta name="theme-color" content={b.primaryColor || '#D4AF37'} />
    <link rel="canonical" href={siteUrl} />
    {icon ? <link rel="icon" href={icon} /> : null}
    {icon ? <link rel="apple-touch-icon" href={icon} /> : null}
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content={siteUrl} />
    <meta property="og:site_name" content={name} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    {image ? <meta property="og:image" content={image} /> : null}
    {image ? <meta property="og:image:width" content={String(b.ogImageSize?.width || 1200)} /> : null}
    {image ? <meta property="og:image:height" content={String(b.ogImageSize?.height || 630)} /> : null}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    {image ? <meta name="twitter:image" content={image} /> : null}
  </>;
}
