"use client";

import { useMemo, useState } from 'react';

type AssetKey = 'logo' | 'favicon' | 'login' | 'hero' | 'og';
type BrandingState = { logoUrl: string; faviconUrl: string; loginImageUrl: string; heroImageUrl: string; ogImageUrl: string };
type Asset = { key: AssetKey; label: string; width: number; height: number; field: keyof BrandingState; mimeType: 'image/webp' | 'image/png'; fit: 'cover' | 'contain'; quality?: number };

const ASSETS: Asset[] = [
  { key: 'logo', label: 'Logo principal', width: 1200, height: 360, field: 'logoUrl', mimeType: 'image/webp', fit: 'contain', quality: 0.92 },
  { key: 'favicon', label: 'Favicon', width: 512, height: 512, field: 'faviconUrl', mimeType: 'image/png', fit: 'contain' },
  { key: 'login', label: 'Imagem login', width: 1200, height: 1600, field: 'loginImageUrl', mimeType: 'image/webp', fit: 'cover', quality: 0.9 },
  { key: 'hero', label: 'Hero/banner', width: 1920, height: 900, field: 'heroImageUrl', mimeType: 'image/webp', fit: 'cover', quality: 0.9 },
  { key: 'og', label: 'Open Graph', width: 1200, height: 630, field: 'ogImageUrl', mimeType: 'image/webp', fit: 'cover', quality: 0.9 },
];

const EMPTY: BrandingState = { logoUrl: '', faviconUrl: '', loginImageUrl: '', heroImageUrl: '', ogImageUrl: '' };

export const brandingPipelineCss = `
.branding-pipeline{grid-column:1/-1;border:1px solid rgba(246,199,92,.2);border-radius:24px;background:rgba(0,0,0,.24);padding:18px}.branding-pipeline-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}.branding-pipeline-kicker{margin:0 0 6px;text-transform:uppercase;letter-spacing:.26em;color:#f6c75c;font-size:12px;font-weight:900}.branding-pipeline-head p:last-child{margin:0;color:rgba(248,247,251,.62);line-height:1.45}.branding-pipeline-actions{display:flex;gap:10px;flex-wrap:wrap}.branding-btn{border:1px solid rgba(255,255,255,.14);border-radius:14px;background:rgba(255,255,255,.06);color:#fff;padding:10px 14px;font-weight:900;cursor:pointer;text-align:center}.branding-btn.gold{background:linear-gradient(135deg,#ffd978,#c99a35);border:0;color:#171007}.branding-btn.danger{background:rgba(255,86,86,.12);border-color:rgba(255,86,86,.32);color:#ffb5b5}.branding-btn.cyan{background:rgba(76,220,255,.09);border-color:rgba(76,220,255,.24);color:#d8fbff}.branding-btn:disabled{opacity:.45;cursor:not-allowed}.branding-hidden{display:none}.branding-status{margin-top:12px;border-radius:14px;padding:12px 14px;font-size:13px}.branding-status.ok{border:1px solid rgba(74,222,128,.22);background:rgba(74,222,128,.1);color:#bbf7d0}.branding-status.bad{border:1px solid rgba(248,113,113,.24);background:rgba(248,113,113,.1);color:#fecaca}.branding-preview-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:16px}.branding-preview-card{border:1px solid rgba(255,255,255,.1);border-radius:20px;background:rgba(0,0,0,.25);padding:12px}.branding-preview-media{display:flex;align-items:center;justify-content:center;aspect-ratio:16/9;border:1px solid rgba(255,255,255,.11);border-radius:14px;background:rgba(0,0,0,.35);overflow:hidden;padding:8px}.branding-preview-media img{max-width:100%;max-height:100%;object-fit:contain}.branding-preview-media span{font-size:12px;color:rgba(248,247,251,.45)}.branding-preview-card strong{display:block;margin-top:10px;color:#fff;font-size:13px}.branding-preview-card small{display:block;color:rgba(248,247,251,.5);font-size:11px;margin-top:2px}.branding-preview-card .branding-btn{width:100%;margin-top:8px;font-size:11px;padding:8px 10px}.branding-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.branding-field-grid label{display:grid;gap:7px;color:rgba(248,247,251,.6);font-size:12px;font-weight:800}.branding-field-grid input{height:46px;border-radius:14px;border:1px solid rgba(255,255,255,.13);background:rgba(0,0,0,.22);color:#fff;padding:0 14px;outline:0}.branding-save{position:sticky;bottom:18px;margin-top:16px;border:1px solid rgba(246,199,92,.24);border-radius:18px;background:rgba(18,16,23,.93);padding:10px;backdrop-filter:blur(14px)}.branding-save button{width:100%}@media(max-width:1050px){.branding-preview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.branding-pipeline-head{display:grid}.branding-field-grid,.branding-preview-grid{grid-template-columns:1fr}.branding-pipeline-actions{display:grid}.branding-btn{width:100%}}
`;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível carregar a imagem.')); };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem otimizada.')), mimeType, quality));
}

function drawAsset(image: HTMLImageElement, asset: Asset) {
  const canvas = document.createElement('canvas');
  canvas.width = asset.width;
  canvas.height = asset.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  ctx.clearRect(0, 0, asset.width, asset.height);
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = asset.fit === 'cover' ? Math.max(asset.width / iw, asset.height / ih) : Math.min(asset.width / iw, asset.height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, (asset.width - dw) / 2, (asset.height - dh) / 2, dw, dh);
  return canvas;
}

async function uploadAsset(asset: Asset, blob: Blob) {
  const extension = asset.mimeType === 'image/png' ? 'png' : 'webp';
  const form = new FormData();
  form.append('asset', asset.key);
  form.append('file', new File([blob], `${asset.key}.${extension}`, { type: asset.mimeType }));
  const response = await fetch('/api/admin/branding-upload', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `Falha ao enviar ${asset.label}.`);
  return data.url as string;
}

export function BrandingPipelineManager({ initial }: { initial: BrandingState }) {
  const [values, setValues] = useState<BrandingState>(initial);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => ASSETS.map((asset) => ({ ...asset, url: values[asset.field] })), [values]);

  async function generate(file: File, onlyAsset?: Asset) {
    try {
      setLoading(true);
      setError(null);
      const image = await loadImage(file);
      const next = { ...values };
      for (const asset of onlyAsset ? [onlyAsset] : ASSETS) {
        setMessage(`Gerando ${asset.label} (${asset.width}x${asset.height})...`);
        const canvas = drawAsset(image, asset);
        const blob = await canvasToBlob(canvas, asset.mimeType, asset.quality);
        next[asset.field] = await uploadAsset(asset, blob);
      }
      setValues(next);
      setMessage(onlyAsset ? `${onlyAsset.label} atualizado. Agora clique em Salvar configurações.` : 'Pipeline concluído. Agora clique em Salvar configurações.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar identidade visual.');
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }

  function clearAsset(asset: Asset) {
    setValues((current) => ({ ...current, [asset.field]: '' }));
    setMessage(`${asset.label} removido. Clique em Salvar configurações.`);
    setError(null);
  }

  return (
    <div className="branding-pipeline">
      <input type="hidden" name="logoUrl" value={values.logoUrl} />
      <input type="hidden" name="faviconUrl" value={values.faviconUrl} />
      <input type="hidden" name="loginImageUrl" value={values.loginImageUrl} />
      <input type="hidden" name="heroImageUrl" value={values.heroImageUrl} />
      <input type="hidden" name="ogImageUrl" value={values.ogImageUrl} />
      <div className="branding-pipeline-head">
        <div><p className="branding-pipeline-kicker">Pipeline inteligente de identidade</p><p>Suba uma imagem matriz e o Hub gera automaticamente logo, favicon, imagem de login, hero/banner e Open Graph.</p></div>
        <div className="branding-pipeline-actions">
          <label className="branding-btn gold">{loading ? 'Processando...' : 'Subir imagem matriz'}<input type="file" accept="image/png,image/jpeg,image/webp" className="branding-hidden" disabled={loading} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void generate(file); }} /></label>
          <button type="button" onClick={() => { setValues(EMPTY); setMessage('Uploads removidos. Clique em Salvar configurações.'); }} disabled={loading} className="branding-btn danger">Remover tudo</button>
        </div>
      </div>
      {message ? <p className="branding-status ok">{message}</p> : null}
      {error ? <p className="branding-status bad">{error}</p> : null}
      <div className="branding-preview-grid">
        {previews.map((asset) => <div key={asset.key} className="branding-preview-card"><div className="branding-preview-media">{asset.url ? <img src={asset.url} alt={asset.label} /> : <span>Sem imagem</span>}</div><strong>{asset.label}</strong><small>{asset.width}x{asset.height}</small><label className="branding-btn">Upload específico<input type="file" accept="image/png,image/jpeg,image/webp" className="branding-hidden" disabled={loading} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void generate(file, asset); }} /></label><button type="button" onClick={() => clearAsset(asset)} disabled={loading || !asset.url} className="branding-btn danger">Remover upload</button></div>)}
      </div>
    </div>
  );
}
