"use client";

import { useState } from 'react';
import { BrandingPipelineManager } from '@/components/admin/branding-pipeline-manager';
import type { AdminSettings, BrandingAssetSize } from '@/lib/data/admin-settings';

const DEFAULT_ASSET_SIZES = {
  logo: { width: 260, height: 78 },
  favicon: { width: 512, height: 512 },
  login: { width: 1200, height: 1600 },
  hero: { width: 1920, height: 900 },
  og: { width: 1200, height: 630 },
} satisfies Record<string, BrandingAssetSize>;

function parseSize(value: FormDataEntryValue | null, fallback: BrandingAssetSize): BrandingAssetSize {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<BrandingAssetSize>;
    return {
      width: Math.max(40, Math.min(4000, Number(parsed.width || fallback.width))),
      height: Math.max(20, Math.min(4000, Number(parsed.height || fallback.height))),
    };
  } catch {
    return fallback;
  }
}

export function AdminSettingsForm({ settings }: { settings: AdminSettings }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logoSize = settings.branding.logoSize || DEFAULT_ASSET_SIZES.logo;
  const faviconSize = settings.branding.faviconSize || DEFAULT_ASSET_SIZES.favicon;
  const loginImageSize = settings.branding.loginImageSize || DEFAULT_ASSET_SIZES.login;
  const heroImageSize = settings.branding.heroImageSize || DEFAULT_ASSET_SIZES.hero;
  const ogImageSize = settings.branding.ogImageSize || DEFAULT_ASSET_SIZES.og;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const branding: AdminSettings['branding'] = {
      appName: String(formData.get('appName') || 'Foco em Canto Academy'),
      logoUrl: String(formData.get('logoUrl') || ''),
      faviconUrl: String(formData.get('faviconUrl') || ''),
      primaryColor: String(formData.get('primaryColor') || '#D4AF37'),
      loginImageUrl: String(formData.get('loginImageUrl') || ''),
      heroImageUrl: String(formData.get('heroImageUrl') || ''),
      ogImageUrl: String(formData.get('ogImageUrl') || ''),
      logoSize: parseSize(formData.get('logoSizeJson'), logoSize),
      faviconSize: parseSize(formData.get('faviconSizeJson'), faviconSize),
      loginImageSize: parseSize(formData.get('loginImageSizeJson'), loginImageSize),
      heroImageSize: parseSize(formData.get('heroImageSizeJson'), heroImageSize),
      ogImageSize: parseSize(formData.get('ogImageSizeJson'), ogImageSize),
    };
    const payload: AdminSettings = { branding };

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao salvar configurações.');
      setMessage('Configurações salvas com sucesso.');
      window.dispatchEvent(new CustomEvent('hub:branding-updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="branding-settings-form">
      {message ? <p className="branding-status ok">{message}</p> : null}
      {error ? <p className="branding-status bad">{error}</p> : null}
      <BrandingPipelineManager
        initial={{
          logoUrl: settings.branding.logoUrl,
          faviconUrl: settings.branding.faviconUrl,
          loginImageUrl: settings.branding.loginImageUrl || '',
          heroImageUrl: settings.branding.heroImageUrl || '',
          ogImageUrl: settings.branding.ogImageUrl || '',
        }}
        initialSizes={{
          logo: logoSize,
          favicon: faviconSize,
          login: loginImageSize,
          hero: heroImageSize,
          og: ogImageSize,
        }}
      />
      <div className="branding-field-grid">
        <label>Nome do app<input name="appName" defaultValue={settings.branding.appName} placeholder="Foco em Canto Academy" /></label>
        <label>Cor principal<input name="primaryColor" defaultValue={settings.branding.primaryColor} placeholder="#D4AF37" /></label>
      </div>
      <div className="branding-save"><button className="branding-btn gold" type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar configurações'}</button></div>
    </form>
  );
}
