import type { Metadata } from 'next';
import { getAdminSettings } from '@/lib/data/admin-settings';

const DEFAULT_URL = 'https://escola.focoemcanto.com';
const DEFAULT_DESCRIPTION = 'Plataforma premium de treinamento vocal, comunidade, duetos, exercícios e evolução para cantores.';
const DEFAULT_KEYWORDS = ['canto', 'técnica vocal', 'aula de canto', 'treinamento vocal', 'Foco em Canto', 'duetos', 'harmonia vocal'];

type BrandingMetadataFields = {
  appName?: string;
  siteName?: string;
  siteUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  logoUrl?: string;
  faviconUrl?: string;
  loginImageUrl?: string;
  heroImageUrl?: string;
  ogImageUrl?: string;
  primaryColor?: string;
  ogImageSize?: { width?: number; height?: number };
};

function absoluteUrl(value?: string | null, base = DEFAULT_URL) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return new URL(raw, base).toString(); } catch { return ''; }
}

function splitKeywords(value?: string | null) {
  const items = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? items : DEFAULT_KEYWORDS;
}

export async function getBrandingMetadata(): Promise<Metadata> {
  const settings = await getAdminSettings();
  const branding = settings.branding as BrandingMetadataFields;
  const siteUrl = absoluteUrl(branding.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_URL) || DEFAULT_URL;
  const siteName = branding.siteName || branding.appName || 'Foco em Canto Academy';
  const title = branding.seoTitle || siteName;
  const description = branding.seoDescription || DEFAULT_DESCRIPTION;
  const ogImage = absoluteUrl(branding.ogImageUrl || branding.heroImageUrl || branding.loginImageUrl || branding.logoUrl, siteUrl);
  const favicon = absoluteUrl(branding.faviconUrl || branding.logoUrl, siteUrl);
  const appleIcon = absoluteUrl(branding.faviconUrl || branding.logoUrl, siteUrl);

  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: `%s | ${siteName}` },
    description,
    keywords: splitKeywords(branding.seoKeywords),
    applicationName: siteName,
    authors: [{ name: siteName }],
    creator: siteName,
    publisher: siteName,
    alternates: { canonical: siteUrl },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      url: siteUrl,
      siteName,
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: branding.ogImageSize?.width || 1200, height: branding.ogImageSize?.height || 630, alt: title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    icons: {
      icon: favicon || undefined,
      shortcut: favicon || undefined,
      apple: appleIcon || undefined,
    },
    manifest: '/manifest.webmanifest',
    category: 'education',
    other: {
      'theme-color': branding.primaryColor || '#D4AF37',
      'msapplication-TileColor': branding.primaryColor || '#D4AF37',
      'og:image:secure_url': ogImage || '',
    },
  };
}
